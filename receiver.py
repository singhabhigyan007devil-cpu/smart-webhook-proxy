from flask import Flask, request
import time
app = Flask(__name__)

@app.route('/webhook', methods=['POST'])
def handle_webhook():
    print(f"\n[RECEIVED WEBHOOK] {time.ctime()}")
    print("Headers:", request.headers)
    print("Body:", request.json)
    return "OK", 200

if __name__ == '__main__':
    app.run(port=5000)
