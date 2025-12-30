# 🛡️ NethraDrive Caretaker Portal

The **NethraDrive Caretaker Portal** is a comprehensive web dashboard designed to monitor and assist users of the NethraDrive smart wheelchair system. It provides real-time location tracking, emergency alerts, and management of trusted contacts, ensuring safety and connectivity for the user.

## 🚀 Key Features

### 📍 Real-Time GPS Tracking & Navigation
- **Live Tracking**: Visualize the wheelchair's location in real-time on a 3D campus map (SSN College of Engineering).
- **3D Visualization**: Utilizes Mapbox GL JS for immersive 3D building views and terrain.
- **Campus Route Planning**: Calculate walking paths between campus landmarks (Hostels, Departments, Canteens).
- **User vs. Vehicle**: Distinguishes between the caretaker's location (green dot) and the wheelchair's location (red dot).

### 🚨 Safety & Alerts
- **SOS Emergency Alerts**: listen for critical SOS signals from the hardware unit and instantly fly the map to the emergency location.
- **Geofencing Capable**: (Architecture supports future geofence alerts).

### 👥 Trusted Persons Management
- **CRUD Operations**: Add, Edit, and Delete trusted contact details.
- **Photo Identification**: Upload and manage photos for contacts (stored in Firebase Storage).
- **Database**: Real-time synchronization with Firebase Firestore.

### 👤 Multi-Profile Support
- **Profile Switching**: Manage multiple patient/user profiles under a single caretaker account.
- **Role Management**: Switch active context easily via the sidebar.

## 🛠️ Tech Stack

- **Frontend Framework**: React.js (v18+)
- **Mapping Engine**: Mapbox GL JS
- **Backend & Database**: Firebase (Auth, Firestore, Storage)
- **Real-Time Comm**: Socket.IO-client (for GPS hardware connection)
- **Styling**: CSS Modules / Custom CSS

## ⚙️ Setup & Installation

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn
- A Firebase project with Auth, Firestore, and Storage enabled.
- A Mapbox access token.

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd nethradrive-portal
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

### Configuration

1. **Environment Variables**:
   Update the `firebaseConfig` object and `mapboxgl.accessToken` in `src/App.js` with your own credentials.
   *(Note: For production, it is recommended to move these to a `.env` file)*.

### Run Locally

1. **Start the Development Server:**
   ```bash
   npm start
   ```
   Runs the app in development mode. Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

2. **Connect to GPS Module (Optional):**
   Ensure the Python GPS module (Socket.IO server) is running on `http://localhost:5001`. The portal attempts to connect to this address automatically.

## 📂 Project Structure

```
nethradrive-portal/
├── src/
│   ├── App.js           # Main Logic (Map, Auth, UI)
│   ├── campusData.js    # Static coordinate data for campus landmarks
│   ├── index.css        # Global Styles
│   └── ...
├── public/              # Static assets
└── package.json         # Dependencies
```

## 🤝 Contributing
1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request
