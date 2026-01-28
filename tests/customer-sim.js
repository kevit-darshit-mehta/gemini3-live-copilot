import WebSocket from "ws";

const ws = new WebSocket("ws://localhost:3000?role=customer");

ws.on("open", () => {
  console.log("Customer Connected");

  // 1. Initial greeting (Neutral)
  setTimeout(() => {
    console.log("Sending: Hello");
    ws.send(
      JSON.stringify({
        type: "text",
        content: "Hello, I need help with my order.",
      }),
    );
  }, 4000);

  // 2. Angry message (Trigger Escalation)
  setTimeout(() => {
    console.log("Sending: Angry Message");
    ws.send(
      JSON.stringify({
        type: "text",
        content:
          "This is absolutely terrible! I am extremely angry and frustrated with your service! Fix it now!",
      }),
    );
  }, 8000);

  // Keep alive to receive supervisor responses
});

ws.on("message", (data) => {
  const msg = JSON.parse(data);
  console.log("Received:", msg.type);

  if (msg.type === "supervisor_message") {
    console.log("Supervisor says:", msg.content);
  }
  if (msg.type === "audio") {
    console.log(
      `Received Audio Chunk: ${msg.data.slice(0, 20)}... (${msg.data.length} chars)`,
    );
  }
  if (msg.type === "mode_change") {
    console.log("Mode changed to:", msg.mode);
  }
});

ws.on("error", (e) => console.error(e));
