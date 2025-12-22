# SSN Campus 3D Navigator

A high-precision, 3D interactive map for SSN College of Engineering, designed for accurate walking navigation and tracking.

## 🚀 Features

### Core Navigation
- **Precise Verification**: All buildings (Hostels 1-9, Departments, Shops) are manually calibrated for 100% accuracy.
- **Walking Directions**: Navigation profile optimized for campus paths and service roads.
- **Off-Road Guide**: A **dashed green line** connects you seamlessly to the nearest path if you are off-road (e.g., parking lots, grounds).
- **Draggable Destination**: Fine-tune your target by dragging the destination marker.

### Visualization
- **3D Tilt**: Map pitched at 60° (or adjustable) for a realistic campus view.
- **Satellite Toggle**: Switch between clean Vector Map and Satellite Imagery to see real-world details.
- **Unified Styling**: "SSN Blue" markers with high-contrast text labels.

### Connectivity (IoT Ready)
- **Real-Time Tracking**: GPS integration via Flask-SocketIO to update wheelchair/user location dynamically.
- **Caretaker Portal Endpoint**: Ready to receive `POST` data from Raspberry Pi/GPS modules.

## 🛠️ Tech Stack

### Frontend
- **HTML5 & CSS3**: Glassmorphism UI, responsive design.
- **Mapbox GL JS**: 3D rendering engine.
- **JavaScript (ES6+)**: Custom routing logic and geometry handling.

### Backend
- **Python**: Core language.
- **Flask**: Web framework.
- **Flask-SocketIO**: Real-time bi-directional communication for zero-latency graphical updates.

## 📂 Project Structure

```
IFP/
├── app.py                # Flask Server + SocketIO Event Handlers
├── templates/
│   └── index.html        # Main Map UI (Mapbox Logic + Client Scripts)
├── static/               # (Optional) CSS/JS assets
└── README.md             # This file
```

## 🚀 Speed Start

1. **Install Dependencies**:
   ```bash
   pip install flask flask-socketio
   ```

2. **Run Server**:
   ```bash
   python app.py
   ```

3. **Open:** Navigate to `http://localhost:5000` (or your IP) in a browser.

## 📡 API Endpoints

- **POST `/update_location`**
  - Accepts JSON: `{ "lat": 12.123, "lng": 80.123 }`
  - Broadcasts update to all connected map clients instantly.
