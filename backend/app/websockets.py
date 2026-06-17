from fastapi import WebSocket
from typing import List

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        print(f"[WS] Client connected. Active connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            print(f"[WS] Client disconnected. Active connections: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        print(f"[WS] Broadcasting event '{message.get('event')}' to {len(self.active_connections)} client(s)")
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception as e:
                print(f"[WS ERROR] Failed to send payload: {e}")
                self.disconnect(connection)

manager = ConnectionManager()
