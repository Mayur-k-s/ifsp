from flask import Flask, render_template
from flask_socketio import SocketIO, emit

app = Flask(__name__)
# Enable CORS so the Pi can send data to your Mac
socketio = SocketIO(app, cors_allowed_origins="*")

@app.route('/')
def index():
    return render_template('index.html')

# Endpoint for the Raspberry Pi to post GPS data
@app.route('/update_location', methods=['POST'])
def update_location():
    data = request.json
    # Broadcast to the 3D Map in the browser
    socketio.emit('location_update', data)
    return {'status': 'success'}, 200

@socketio.on('connect')
def handle_connect():
    print("Caretaker portal connected.")
    # Send initial SSN College coordinates [cite: 74, 116]
    emit('location_update', {'lat': 12.7509, 'lng': 80.1974})

if __name__ == '__main__':
    # Using 0.0.0.0 allows it to work on your current network IP automatically
    socketio.run(app, host='0.0.0.0', port=5001, debug=True)