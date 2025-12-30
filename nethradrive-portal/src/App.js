import React, { useState, useEffect, useRef } from 'react';
import { io } from "socket.io-client";
// Firebase v9 Modular Imports [cite: 103]
import { initializeApp, getApps } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, collection, doc, setDoc, addDoc, getDoc, deleteDoc, updateDoc, onSnapshot, query, where, serverTimestamp } from "firebase/firestore"; // Added deleteDoc, updateDoc
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
// Mapbox Integration [cite: 74]
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { campusData } from './campusData'; // [NEW] Import data

// 1. Your Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBsM1OrHhzQwHwBATLnfs0kjtFxtksR0JM",
  authDomain: "nethradrive.firebaseapp.com",
  projectId: "nethradrive",
  // CHANGE THIS LINE BELOW:
  storageBucket: "nethradrive.firebasestorage.app",
  messagingSenderId: "30680105702",
  appId: "1:30680105702:web:18c4d0e8667f4e7cb57127"
};

// Initialize Firebase Services [cite: 103, 135]
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Use your existing Mapbox token [cite: 75]
mapboxgl.accessToken = 'pk.eyJ1IjoibWF5dXJrcyIsImEiOiJjbWpoZmF5cTQwcTZzM2RxdmZkeGc4aXRvIn0.w53nwvcH9lLU_bx9aoiVZw';

function App() {
  // Authentication & Profile States
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // [NEW] Multiple Profiles State
  const [profiles, setProfiles] = useState([]);
  const [activeProfile, setActiveProfile] = useState(null); // Entire doc object: { id, ...data }

  // Known Persons States [cite: 131, 248]
  const [newPerson, setNewPerson] = useState({ name: "", relation: "", phone: "", address: "" });
  const [imageFile, setImageFile] = useState(null);
  const [editingContactId, setEditingContactId] = useState(null); // [NEW] Track which contact is being edited

  // Map States [cite: 74, 323]
  const mapContainer = useRef(null);
  const map = useRef(null);
  const vehicleMarker = useRef(null);
  const userMarker = useRef(null); // [NEW] User Marker
  const activeDestMarker = useRef(null);
  const [vehicleLocation, setVehicleLocation] = useState(null);
  const [userLocation, setUserLocation] = useState(null); // [NEW] User Location

  // Navigation States [NEW]
  const [selectedDest, setSelectedDest] = useState("");
  const [routeStats, setRouteStats] = useState({ dist: 0, time: 0 });
  const [isCalculating, setIsCalculating] = useState(false);
  const [showProfile, setShowProfile] = useState(false); // [NEW] Toggle Profile

  // Dashboard States [NEW]
  const [currentView, setCurrentView] = useState('map'); // 'map' or 'persons'
  const [knownPersons, setKnownPersons] = useState([]);

  // [NEW] Listener Refs for Cleanup
  const profilesUnsub = useRef(null);
  const knownPersonsUnsub = useRef(null);

  // Monitor Login Status
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      // 1. Cleanup previous listeners on ANY auth change (login OR logout)
      if (profilesUnsub.current) { profilesUnsub.current(); profilesUnsub.current = null; }
      if (knownPersonsUnsub.current) { knownPersonsUnsub.current(); knownPersonsUnsub.current = null; }

      setUserLocation(null); // Reset on logout
      setUser(currentUser);

      // [NEW] Fetch Data if user logs in
      if (currentUser) {
        try {
          // Listen to Profiles Sub-collection
          const profilesQuery = query(collection(db, "Caretakers", currentUser.uid, "Profiles"));
          // Store unsubscribe in ref
          profilesUnsub.current = onSnapshot(profilesQuery, (snapshot) => {
            const loadedProfiles = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setProfiles(loadedProfiles);

            // Set default active profile if none selected or if list changed significantly
            if (loadedProfiles.length > 0) {
              // If we don't have an active profile, or the active one was deleted, pick the first one
              setActiveProfile(prev => {
                const exists = loadedProfiles.find(p => p.id === prev?.id);
                return exists || loadedProfiles[0];
              });
            } else {
              setActiveProfile(null);
            }
          });

          // Fetch trusted persons list and store unsub ref
          if (knownPersonsUnsub.current) knownPersonsUnsub.current(); // Safety check
          knownPersonsUnsub.current = fetchKnownPersons(currentUser.uid);
        } catch (e) {
          console.error("Error fetching data:", e);
        }
      } else {
        setProfiles([]);
        setActiveProfile(null);
        setKnownPersons([]);
      }
    });
    return () => {
      unsubscribe();
      // Final cleanup on unmount
      if (profilesUnsub.current) profilesUnsub.current();
      if (knownPersonsUnsub.current) knownPersonsUnsub.current();
    };
  }, []);

  // Listen for Real-Time SOS Alerts [cite: 133, 249, 279]
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "EmergencyAlerts"), where("status", "==", "active"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const alertData = change.doc.data();
          alert(`🚨 SOS ALERT: Emergency detected! Check map for location.`);
          if (map.current) {
            map.current.flyTo({ center: [alertData.lng, alertData.lat], zoom: 18, pitch: 60 });
          }
        }
      });
    });
    return () => unsubscribe();
  }, [user]);

  // Initialize 3D Campus Map [cite: 74, 323]
  useEffect(() => {
    // Only initialize map if user is logged in AND current view is 'map'
    // But since we want to toggle views without destroying map context if possible... 
    // Actually, destroying map on view switch is simpler for layout. 
    // We already check if mapContainer.current exists.
    if (user && mapContainer.current && !map.current && currentView === 'map') {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/standard',
        center: [80.1965, 12.7515], // Adjusted Center
        zoom: 17,
        pitch: 45,
        bearing: -10
      });

      map.current.on('load', () => {
        const m = map.current;

        // 1. Hide default POIs
        try {
          if (m.style && m.style.stylesheet) {
            m.setConfigProperty('basemap', 'showPointOfInterestLabels', false);
            m.setConfigProperty('basemap', 'showTransitLabels', false);
            m.setConfigProperty('basemap', 'showPlaceLabels', false);
          }
        } catch (e) { console.log('Config prop error', e); }

        // 2. Fallback: Manual Layer Hiding
        const layers = m.getStyle().layers;
        if (layers) {
          for (const layer of layers) {
            if (layer.id.includes('poi') || layer.id.includes('label')) {
              if (!layer.id.includes('ssn-')) {
                try { m.setLayoutProperty(layer.id, 'visibility', 'none'); } catch (e) { }
              }
            }
          }
        }

        m.addSource('mapbox-dem', { 'type': 'raster-dem', 'url': 'mapbox://mapbox.mapbox-terrain-dem-v1' });
        m.setTerrain({ 'source': 'mapbox-dem', 'exaggeration': 1.5 });

        addCustomCampusLayer(m);
      });
    }

    // Capture user location if map exists
    if (map.current && userLocation) {
      if (!userMarker.current) {
        const el = document.createElement('div');
        el.className = 'user-marker';
        el.style.backgroundColor = '#2ecc71';
        el.style.width = '15px';
        el.style.height = '15px';
        el.style.borderRadius = '50%';
        el.style.border = '2px solid white';
        el.style.boxShadow = '0 0 10px rgba(0,0,0,0.3)';
        userMarker.current = new mapboxgl.Marker(el)
          .setLngLat([userLocation.lng, userLocation.lat])
          .addTo(map.current);
      }
    }

    // Clean up on unmount or view switch? 
    // If we switch views, mapContainer is removed from DOM, so map.current should be cleaned up.
    if (currentView !== 'map' && map.current) {
      map.current.remove();
      map.current = null;
      vehicleMarker.current = null;
      userMarker.current = null;
    }

  }, [user, currentView, userLocation]); // Dependencies updated

  // [NEW] Browser Geolocation Helper
  useEffect(() => {
    if (!user) return; // Don't track if not logged in

    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const { longitude, latitude } = pos.coords;
          setUserLocation({ lng: longitude, lat: latitude });

          if (map.current) {
            if (!userMarker.current) {
              const el = document.createElement('div');
              el.className = 'user-marker';
              el.style.backgroundColor = '#2ecc71'; // Green for User
              el.style.width = '15px';
              el.style.height = '15px';
              el.style.borderRadius = '50%';
              el.style.border = '2px solid white';
              el.style.boxShadow = '0 0 10px rgba(0,0,0,0.3)';

              userMarker.current = new mapboxgl.Marker(el)
                .setLngLat([longitude, latitude])
                .addTo(map.current);
            } else {
              userMarker.current.setLngLat([longitude, latitude]);
            }
          }
        },
        (err) => {
          console.warn("Location Access Error:", err);
        },
        { enableHighAccuracy: true }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [user, currentView]); // Added currentView to re-attach if map reloads

  // Connect to GPS Module Socket [NEW]
  useEffect(() => {
    // Force WebSocket to avoid polling issues that might look like reloads
    const socket = io("http://localhost:5001", {
      transports: ["websocket"],
      reconnectionAttempts: 5
    });

    socket.on("connect", () => {
      console.log("Connected to GPS Module via WebSocket");
    });

    socket.on("connect_error", (err) => {
      console.error("Socket Connection Error:", err);
    });

    socket.on("location_update", (data) => {
      console.log("GPS Update:", data);
      setVehicleLocation(data);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Update Map with Vehicle Marker [NEW]
  useEffect(() => {
    if (!map.current || !vehicleLocation) return;

    const { lat, lng } = vehicleLocation;

    if (!vehicleMarker.current) {
      const el = document.createElement('div');
      el.className = 'vehicle-marker';
      el.style.backgroundColor = '#e74c3c'; // Red
      el.style.width = '15px';
      el.style.height = '15px';
      el.style.borderRadius = '50%';
      el.style.border = '2px solid white';
      el.style.boxShadow = '0 0 10px rgba(0,0,0,0.3)';

      vehicleMarker.current = new mapboxgl.Marker(el)
        .setLngLat([lng, lat])
        .addTo(map.current);
    } else {
      vehicleMarker.current.setLngLat([lng, lat]);
    }
  }, [vehicleLocation, currentView]);

  // --- Map Helper Functions ---

  const addCustomCampusLayer = (mapInstance) => {
    const features = [];
    Object.values(campusData).forEach(places => {
      places.forEach(place => {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: place.coords },
          properties: { title: place.name }
        });
      });
    });

    mapInstance.addSource('ssn-places', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: features }
    });

    // Text Labels
    mapInstance.addLayer({
      'id': 'ssn-custom-labels',
      'type': 'symbol',
      'source': 'ssn-places',
      'layout': {
        'text-field': ['get', 'title'],
        'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
        'text-offset': [0, 1.0],
        'text-anchor': 'top',
        'text-size': 12,
        'text-max-width': 10
      },
      'paint': {
        'text-color': '#ffffff',
        'text-halo-color': '#003366',
        'text-halo-width': 2
      }
    });

    // Dots
    mapInstance.addLayer({
      'id': 'ssn-custom-dots',
      'type': 'circle',
      'source': 'ssn-places',
      'paint': {
        'circle-radius': 6,
        'circle-color': '#003366',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff'
      }
    });
  };

  const calculateCampusRoute = async () => {
    if (!selectedDest) {
      alert("Please select a destination first.");
      return;
    }

    // Determine Start Point: User Location > Vehicle Location > Default
    let startLng, startLat;

    if (userLocation) {
      startLng = userLocation.lng;
      startLat = userLocation.lat;
    } else if (vehicleLocation) {
      startLng = vehicleLocation.lng;
      startLat = vehicleLocation.lat;
      alert("Using Vehicle Location (User GPS not found).");
    } else {
      // Default to Main Gate if nothing else
      startLng = 80.203483;
      startLat = 12.751720;
      alert("Using Main Gate (User/Vehicle GPS not found).");
    }

    const [destLng, destLat] = selectedDest.split(',').map(Number);
    const startCoords = [startLng, startLat].join(',');

    // Clear previous dest marker
    if (activeDestMarker.current) activeDestMarker.current.remove();

    // Add new destination marker
    activeDestMarker.current = new mapboxgl.Marker({ draggable: true, color: '#e74c3c' })
      .setLngLat([destLng, destLat])
      .addTo(map.current);

    activeDestMarker.current.on('dragend', async () => {
      const newLngLat = activeDestMarker.current.getLngLat();
      await fetchRoute(startCoords, `${newLngLat.lng},${newLngLat.lat}`);
    });

    await fetchRoute(startCoords, `${destLng},${destLat}`);

    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend([startLng, startLat]);
    bounds.extend([destLng, destLat]);
    map.current.fitBounds(bounds, { padding: 80, pitch: 60 });
  };

  const fetchRoute = async (start, end) => {
    setIsCalculating(true);
    try {
      const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${start};${end}?geometries=geojson&steps=true&access_token=${mapboxgl.accessToken}`;
      const req = await fetch(url);
      const json = await req.json();

      if (!json.routes || json.routes.length === 0) {
        alert("No path found.");
        return;
      }

      const route = json.routes[0];
      setRouteStats({ dist: Math.round(route.distance), time: Math.round(route.duration / 60) });

      drawRoute(route.geometry);

      // Draw connection line from start (User/Vehicle) to Route Start
      if (userLocation) {
        drawUserPath([userLocation.lng, userLocation.lat], route.geometry.coordinates[0]);
      } else if (vehicleLocation) {
        drawUserPath([vehicleLocation.lng, vehicleLocation.lat], route.geometry.coordinates[0]);
      }

    } catch (e) {
      console.error(e);
    } finally {
      setIsCalculating(false);
    }
  };

  const drawRoute = (geojson) => {
    const m = map.current;
    if (m.getSource('route')) {
      m.getSource('route').setData(geojson);
    } else {
      m.addLayer({
        id: 'route', type: 'line',
        source: { type: 'geojson', data: { type: 'Feature', geometry: geojson } },
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#ff9f43', 'line-width': 6, 'line-opacity': 0.9 }
      });
      m.addLayer({
        id: 'route-casing', type: 'line',
        source: 'route', beforeId: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#000', 'line-width': 9 }
      });
    }
  };




  // Auth Handlers
  const handleRegister = () => {
    createUserWithEmailAndPassword(auth, email, password)
      .then(() => alert("Caretaker Account Created!"))
      .catch((err) => alert(err.message));
  };

  const handleLogin = () => {
    signInWithEmailAndPassword(auth, email, password).catch((err) => alert(err.message));
  };

  // Database Handlers [cite: 103, 131]
  // Database Handlers [cite: 103, 131]

  // [NEW] Profile Handlers
  const handleAddProfile = async () => {
    if (!user) return;
    const name = prompt("Enter Name for new Profile:");
    if (!name) return;

    try {
      await addDoc(collection(db, "Caretakers", user.uid, "Profiles"), {
        name: name,
        relation: "",
        phone: "",
        createdAt: serverTimestamp()
      });
    } catch (e) { console.error(e); alert("Error adding profile"); }
  };

  const handleDeleteProfile = async (profileId, e) => {
    e.stopPropagation(); // Prevent selecting the profile when clicking delete
    if (!window.confirm("Are you sure you want to delete this profile?")) return;
    try {
      await deleteDoc(doc(db, "Caretakers", user.uid, "Profiles", profileId));
      // Active profile switch handled by onSnapshot logic
    } catch (e) { console.error(e); alert("Error deleting profile"); }
  };

  const handleUpdateProfile = async () => {
    if (!user || !activeProfile) return;
    try {
      await updateDoc(doc(db, "Caretakers", user.uid, "Profiles", activeProfile.id), {
        name: activeProfile.name || "",
        relation: activeProfile.relation || "",
        phone: activeProfile.phone || "",
        updatedAt: serverTimestamp()
      });
      alert("Profile Updated!");
    } catch (e) { console.error(e); alert("Failed to update profile"); }
  };

  // [NEW] Trusted Person Actions
  const handleEditKnownPerson = (person) => {
    setNewPerson({
      name: person.name,
      relation: person.relation,
      phone: person.phone || "",
      address: person.address || ""
    });
    // Note: We don't preload imageFile because it's a file input, user only uploads if changing it
    setEditingContactId(person.id);
    setShowProfile(true); // Open sidebar
  };

  const handleCancelEdit = () => {
    setNewPerson({ name: "", relation: "", phone: "", address: "" });
    setImageFile(null);
    setEditingContactId(null);
  };

  const handleDeleteKnownPerson = async (id, e) => {
    e.stopPropagation(); // Stop bubbling
    console.log("Delete clicked for:", id);

    if (!window.confirm("Permanently delete this trusted contact?")) return;

    try {
      console.log("Attempting deleteDoc for:", id);
      await deleteDoc(doc(db, "KnownPersons", id));
      console.log("Delete success");
      alert("Contact Deleted!");
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Error deleting contact: " + err.message);
    }
  };

  const saveKnownPerson = async () => {
    if (!newPerson.name || !newPerson.relation) {
      return alert("Please fill in Name and Relation!");
    }

    // Check photo only if ADDING a new person. For editing, it's optional.
    if (!editingContactId && !imageFile) {
      return alert("Please upload a identification photo!");
    }

    try {
      let downloadURL = null;

      // Upload new image if provided
      if (imageFile) {
        console.log("Uploading image...");
        const filename = `kp_${Date.now()}_${user.uid.slice(0, 5)}`;
        const storageRef = ref(storage, `known_persons/${filename}`);
        const snapshot = await uploadBytes(storageRef, imageFile);
        downloadURL = await getDownloadURL(snapshot.ref);
      }

      if (editingContactId) {
        // UPDATE EXISTING
        const updateData = { ...newPerson, updatedAt: serverTimestamp() };
        if (downloadURL) updateData.photoUrl = downloadURL; // Only update photo if new one uploaded

        await updateDoc(doc(db, "KnownPersons", editingContactId), updateData);
        alert("Contact Updated Successfully!");
      } else {
        // CREATE NEW
        await addDoc(collection(db, "KnownPersons"), {
          ...newPerson,
          photoUrl: downloadURL || "https://via.placeholder.com/150",
          addedBy: user.uid,
          createdAt: serverTimestamp(),
          visitCount: 0
        });
        alert("Contact Saved Successfully!");
      }

      handleCancelEdit(); // Reset form
      // fetchKnownPersons removed - realtime listener updates automatically

    } catch (error) {
      console.error("Save Error:", error);
      alert("Critical Error: " + error.message);
    }
  };

  const drawUserPath = (from, to) => {
    const m = map.current;
    if (!m) return;
    const geojson = { type: 'Feature', geometry: { type: 'LineString', coordinates: [from, to] } };

    // Add source if missing
    if (!m.getSource('user-path')) {
      m.addSource('user-path', { type: 'geojson', data: geojson });
    } else {
      m.getSource('user-path').setData(geojson);
    }

    // Add layer if missing
    if (!m.getLayer('user-path-dotted')) {
      m.addLayer({
        id: 'user-path-dotted', type: 'line', source: 'user-path',
        paint: {
          'line-color': '#3498db', // Blue
          'line-width': 4,
          'line-dasharray': [1, 2], // Dotted
          'line-opacity': 0.8
        }
      });
    }
  };

  // Refactored to be synchronous and return the unsub function
  const fetchKnownPersons = (uid) => {
    try {
      const q = query(collection(db, "KnownPersons"), where("addedBy", "==", uid));
      return onSnapshot(q, (snapshot) => {
        const persons = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setKnownPersons(persons);
      });
    } catch (e) {
      console.error("Error fetching persons:", e);
    }
  };

  // --- UI Layout ---

  if (!user) {
    return (
      <div style={styles.authContainer}>
        <div style={styles.card}>
          <h1 style={{ textAlign: 'center', margin: '0 0 10px 0' }}>🛡️ NethraDrive</h1>
          <p style={{ textAlign: 'center', color: '#666', marginBottom: '25px' }}>Caretaker Portal</p>
          <input placeholder="Email" onChange={e => setEmail(e.target.value)} style={styles.input} />
          <input type="password" placeholder="Password" onChange={e => setPassword(e.target.value)} style={styles.input} />
          <button onClick={handleLogin} style={styles.btnPrimary}>Login</button>
          <button onClick={handleRegister} style={styles.btnSecondary}>Register Account</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', fontFamily: 'sans-serif', overflow: 'hidden' }}>

      {/* --- LEFT SIDEBAR --- */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <h2 style={{ margin: '0 0 5px 0', color: '#2c3e50' }}>🛡️ NethraDrive</h2>
          <span style={{ fontSize: '12px', color: '#7f8c8d', background: '#eee', padding: '2px 6px', borderRadius: '4px' }}>Caretaker Portal</span>
        </div>

        {/* Profile Circle & Accordion */}
        <div style={styles.profileSection}>
          <div style={styles.profileHeader} onClick={() => setShowProfile(!showProfile)}>
            <div style={styles.avatar}>
              {activeProfile?.name ? activeProfile.name.charAt(0).toUpperCase() : "👤"}
            </div>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#34495e' }}>{activeProfile?.name || "No Profile"}</div>
              <div style={{ fontSize: '11px', color: '#95a5a6' }}>{user.email}</div>
            </div>
            <div style={{ marginLeft: 'auto', fontSize: '10px' }}>{showProfile ? '▲' : '▼'}</div>
          </div>

          {showProfile && (
            <div style={styles.profileAccordion}>
              {/* [NEW] Multiple Profile List */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '15px', overflowX: 'auto', paddingBottom: '5px' }}>
                {profiles.map(p => (
                  <div
                    key={p.id}
                    onClick={() => setActiveProfile(p)}
                    style={{
                      position: 'relative',
                      minWidth: '35px', height: '35px',
                      borderRadius: '50%',
                      background: activeProfile?.id === p.id ? '#2ecc71' : '#ddd',
                      color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 'bold', cursor: 'pointer', border: activeProfile?.id === p.id ? '2px solid #27ae60' : 'none'
                    }}
                    title={p.name}
                  >
                    {p.name.charAt(0).toUpperCase()}
                    {/* Delete X */}
                    {profiles.length > 1 && (
                      <div
                        onClick={(e) => handleDeleteProfile(p.id, e)}
                        style={{
                          position: 'absolute', top: -2, right: -2, width: '12px', height: '12px',
                          background: 'red', borderRadius: '50%', fontSize: '8px', display: 'flex',
                          alignItems: 'center', justifyContent: 'center'
                        }}
                      >✕</div>
                    )}
                  </div>
                ))}
                {/* Add Profile Button */}
                <div onClick={handleAddProfile} style={{ ...styles.avatar, background: '#3498db', cursor: 'pointer', minWidth: '35px' }}>+</div>
              </div>

              {activeProfile && (
                <>
                  <input placeholder="Name" value={activeProfile.name || ""} onChange={e => setActiveProfile({ ...activeProfile, name: e.target.value })} style={styles.inputSmall} />
                  <input placeholder="Relation" value={activeProfile.relation || ""} onChange={e => setActiveProfile({ ...activeProfile, relation: e.target.value })} style={styles.inputSmall} />
                  <input placeholder="Phone" value={activeProfile.phone || ""} onChange={e => setActiveProfile({ ...activeProfile, phone: e.target.value })} style={styles.inputSmall} />
                  <button onClick={handleUpdateProfile} style={styles.btnAction}>Update Profile</button>
                  <hr style={{ margin: '10px 0', borderTop: '1px dashed #eee' }} />
                </>
              )}

              <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '5px' }}>
                {editingContactId ? "Edit Contact" : "Add Trusted Contact"}
              </div>
              <input placeholder="Name" value={newPerson.name || ""} onChange={e => setNewPerson({ ...newPerson, name: e.target.value })} style={styles.inputSmall} />
              <input placeholder="Relation" value={newPerson.relation || ""} onChange={e => setNewPerson({ ...newPerson, relation: e.target.value })} style={styles.inputSmall} />
              <input placeholder="Phone" value={newPerson.phone || ""} onChange={e => setNewPerson({ ...newPerson, phone: e.target.value })} style={styles.inputSmall} />
              <input type="file" onChange={e => setImageFile(e.target.files[0])} style={styles.inputSmall} />

              <div style={{ display: 'flex', gap: '5px' }}>
                <button onClick={saveKnownPerson} style={styles.btnAction}>
                  {editingContactId ? "Update" : "Save"}
                </button>
                {editingContactId && (
                  <button onClick={handleCancelEdit} style={{ ...styles.btnAction, background: '#95a5a6' }}>Cancel</button>
                )}
              </div>

              <button onClick={() => signOut(auth)} style={{ ...styles.btnAction, background: '#e74c3c', marginTop: '10px' }}>Logout</button>
            </div>
          )}
        </div>

        {/* Navigation Menu */}
        <div style={styles.navMenu}>
          <button
            onClick={() => setCurrentView('map')}
            style={currentView === 'map' ? styles.navBtnActive : styles.navBtn}
          >
            📍 GPS Tracker
          </button>
          <button
            onClick={() => setCurrentView('persons')}
            style={currentView === 'persons' ? styles.navBtnActive : styles.navBtn}
          >
            👥 Trusted Persons
          </button>
        </div>
      </div>

      {/* --- MAIN CONTENT AREA --- */}
      <div style={styles.mainContent}>

        {/* VIEW 1: MAP TRACKER */}
        <div style={{
          display: currentView === 'map' ? 'block' : 'none',
          width: '100%', height: '100%', position: 'relative'
        }}>
          <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

          {/* SSN Navigator Panel */}
          <div style={styles.navPanel}>
            <h3 style={styles.panelHeader}>📍 Navigator</h3>
            <select style={styles.select} onChange={e => setSelectedDest(e.target.value)} value={selectedDest}>
              <option value="">Select Destination</option>
              {Object.entries(campusData).map(([category, places]) => (
                <optgroup label={category} key={category}>
                  {places.map(place => (
                    <option key={place.name} value={place.coords.join(',')}>
                      {place.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button onClick={calculateCampusRoute} style={styles.routeBtn}>
              {isCalculating ? "..." : "Go ➔"}
            </button>
            <div style={styles.stats}>
              <div style={styles.statBox}><strong>{routeStats.dist} m</strong></div>
              <div style={styles.statBox}><strong>{routeStats.time} min</strong></div>
            </div>
          </div>
        </div>

        {/* VIEW 2: TRUSTED PERSONS LIST */}
        {currentView === 'persons' && (
          <div style={styles.personsView}>
            <h2 style={{ color: '#2c3e50', borderBottom: '2px solid #eee', paddingBottom: '10px' }}>👥 Trusted Persons Database</h2>
            {knownPersons.length === 0 ? (
              <p style={{ color: '#777' }}>No known persons added yet. Use the sidebar to add someone.</p>
            ) : (
              <div style={styles.gridContainer}>
                {knownPersons.map(p => (
                  <div key={p.id} style={styles.personCard}>
                    <img src={p.photoUrl} alt={p.name} style={styles.personImg} />
                    <div style={{ padding: '15px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <h3 style={{ margin: '0 0 5px 0' }}>{p.name}</h3>
                        {/* [NEW] Action Buttons */}
                        <div style={{ display: 'flex', gap: '5px' }}>
                          <button
                            onClick={() => handleEditKnownPerson(p)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' }}
                            title="Edit"
                          >✎</button>
                          <button
                            onClick={(e) => {
                              console.log("JSX Click Triggered for ID:", p.id);
                              handleDeleteKnownPerson(p.id, e);
                            }}
                            style={{ background: '#e74c3c', color: 'white', border: 'none', cursor: 'pointer', fontSize: '12px', padding: '5px 10px', borderRadius: '4px' }}
                            title="Delete"
                          >DELETE</button>
                        </div>
                      </div>
                      <div style={{ fontSize: '13px', color: '#7f8c8d' }}>{p.relation} • {p.phone}</div>
                      <div style={styles.visitBadge}>Total Visits: {p.visitCount || 0}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

const styles = {
  authContainer: { display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#f8f9fa' },
  card: { background: 'white', padding: '40px', borderRadius: '15px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', width: '350px' },
  input: { display: 'block', width: '92%', padding: '12px', marginBottom: '15px', borderRadius: '8px', border: '1px solid #ddd' },
  inputSmall: { display: 'block', width: '92%', padding: '8px', marginBottom: '8px', borderRadius: '5px', border: '1px solid #eee', fontSize: '13px' },
  btnPrimary: { width: '100%', padding: '12px', background: '#2ecc71', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', marginBottom: '10px', fontWeight: 'bold' },
  btnSecondary: { width: '100%', padding: '12px', background: '#3498db', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' },
  btnAction: { width: '100%', padding: '8px', background: '#34495e', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', marginTop: '5px', fontSize: '12px' },

  // Sidebar
  sidebar: { width: '280px', background: '#fff', borderRight: '1px solid #e0e0e0', display: 'flex', flexDirection: 'column', zIndex: 100 },
  sidebarHeader: { padding: '20px', borderBottom: '1px solid #eee' },
  profileSection: { borderBottom: '1px solid #eee', background: '#fcfcfc' },
  profileHeader: { padding: '15px', display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '10px' },
  avatar: { width: '35px', height: '35px', borderRadius: '50%', background: '#2ecc71', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' },
  profileAccordion: { padding: '15px', background: '#f8f9fa', borderTop: '1px solid #eee' },

  // Navigation
  navMenu: { padding: '20px' },
  navBtn: { display: 'block', width: '100%', textAlign: 'left', padding: '12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#555', borderRadius: '8px', marginBottom: '5px' },
  navBtnActive: { display: 'block', width: '100%', textAlign: 'left', padding: '12px', background: '#e8f6f3', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#16a085', fontWeight: 'bold', borderRadius: '8px', marginBottom: '5px' },

  // Main Content
  mainContent: { flex: 1, background: '#f4f6f8', position: 'relative' },

  // Persons View
  personsView: { padding: '40px', overflowY: 'auto', height: '100%' },
  gridContainer: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px', marginTop: '20px' },
  personCard: { background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', transition: 'transform 0.2s' },
  personImg: { width: '100%', height: '150px', objectFit: 'cover' },
  visitBadge: { marginTop: '10px', fontSize: '11px', background: '#ebf5fb', color: '#2980b9', padding: '4px 8px', borderRadius: '10px', display: 'inline-block', fontWeight: 'bold' },

  // Navigator Panel (Compact)
  navPanel: {
    position: 'absolute', top: '20px', right: '20px',
    background: 'rgba(255, 255, 255, 0.95)',
    padding: '15px', borderRadius: '12px', width: '220px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
  },
  panelHeader: { color: '#2c3e50', margin: '0 0 10px 0', fontSize: '16px' },
  select: { width: '100%', padding: '8px', marginBottom: '10px', borderRadius: '6px', border: '1px solid #ddd' },
  routeBtn: { width: '100%', padding: '10px', background: '#2980b9', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  stats: { marginTop: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#34495e' },
  statBox: { background: '#ecf0f1', padding: '5px 10px', borderRadius: '4px' }
};

export default App;