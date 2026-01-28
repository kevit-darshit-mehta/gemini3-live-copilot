# 🎧 Gemini 3 Live Customer Support Co-Pilot

**A Real-Time AI Voice Agent with Sentiment Analysis & Human Takeover**

Built for the Gemini API Developer Competition.

![Project Banner](public/assets/banner.png)

## 🚀 Overview

This project demonstrates the power of the **Gemini 2.0 Flash (Multimodal Live API)** to create a next-generation customer support experience. It features:

- **Bi-directional Low-Latency Voice**: Real-time conversation with 16kHz audio streaming.
- **Sentiment Analysis**: Analyzes customer frustration in real-time.
- **Smart Escalation**: Automatically alerts supervisors if the customer gets angry.
- **Human Takeover**: Allows a human agent to listen in and "take over" the voice stream instantly.
- **Context injection:** Supervisors can guide the AI with context before handing it back.

## 🛠️ Tech Stack

- **Backend**: Node.js, Express, WebSocket (`ws`)
- **AI**: Google Gemini 2.0 Flash (Multimodal Live API)
- **Frontend**: Vanilla JS, HTML5 AudioContext, Web Audio API
- **Design**: CSS (Glassmorphism Dark Mode)

## 🏃‍♂️ Running Locally

1. **Clone the repository**

   ```bash
   git clone https://github.com/your-username/gemini3-live-copilot.git
   cd gemini3-live-copilot
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure Environment**
   Create a `.env` file in the root:

   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

4. **Start the Server**

   ```bash
   npm run dev
   ```

5. **Open the App**
   - **Supervisor Dashboard**: [http://localhost:3000](http://localhost:3000)
   - **Customer Interface**: [http://localhost:3000/customer.html](http://localhost:3000/customer.html)

## 🧪 Testing the Flow

1. Open the Customer Interface. Click the **Mic** icon and speak.
2. Watch the Supervisor Dashboard to see the real-time transcript.
3. Pretend to be angry ("I am very frustrated!") to trigger the **Frustration Meter**.
4. Use the **Take Over** button on the dashboard to speak as the agent.

## 📄 License

MIT
