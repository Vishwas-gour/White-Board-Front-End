import React, { useEffect, useRef, useState } from "react";
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import axios from "axios";
import "./css/App.css";

const API_URL = "http://localhost:8080";
const SESSION_ID = "default-session";

function App() {
  const canvasRef = useRef(null);
  const stompClientRef = useRef(null);
  const lastPos = useRef({ x: 0, y: 0 });

  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState("#2D3748");
  const [lineWidth, setLineWidth] = useState(4);
  const [tool, setTool] = useState("draw"); // draw | erase
  const [connectedUsers, setConnectedUsers] = useState(1);

  const [userId] = useState(
    () => `user-${Math.random().toString(36).slice(2, 10)}`
  );

  /* =========================
     CANVAS + SOCKET SETUP
  ========================== */
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    loadHistory();

    const client = new Client({
      webSocketFactory: () => new SockJS(`${API_URL}/ws`),
      reconnectDelay: 5000,
      debug: () => {},

      onConnect: () => {
        console.log("STOMP connected");

        client.subscribe("/topic/whiteboard", (message) => {
          const data = JSON.parse(message.body);
          if (data.userId === userId) return;

          if (data.type === "draw") {
            drawLine(
              data.startX,
              data.startY,
              data.endX,
              data.endY,
              data.color,
              data.lineWidth,
              data.tool
            );
          }

          if (data.type === "clear") {
            clearCanvas();
          }
        });

        setConnectedUsers((u) => u + 1);
      },
    });

    client.activate();
    stompClientRef.current = client;

    return () => {
      stompClientRef.current?.deactivate();
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [userId]);

  /* =========================
     API
  ========================== */
  const loadHistory = async () => {
    try {
      const res = await axios.get(
        `${API_URL}/api/whiteboard/history/${SESSION_ID}`
      );

      res.data.forEach((e) => {
        drawLine(
          e.startX,
          e.startY,
          e.endX,
          e.endY,
          e.color,
          e.lineWidth,
          e.tool || "draw"
        );
      });
    } catch (err) {
      console.error("History load failed", err);
    }
  };

  /* =========================
     DRAWING LOGIC
  ========================== */
  const drawLine = (
    x1,
    y1,
    x2,
    y2,
    strokeColor,
    strokeWidth,
    toolType = "draw"
  ) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    ctx.save();

    if (toolType === "erase") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = strokeColor;
    }

    ctx.lineWidth = strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.restore();
  };

  const startDrawing = (e) => {
    setIsDrawing(true);
    const rect = canvasRef.current.getBoundingClientRect();
    lastPos.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const draw = (e) => {
    if (!isDrawing) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const currentPos = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };

    drawLine(
      lastPos.current.x,
      lastPos.current.y,
      currentPos.x,
      currentPos.y,
      color,
      lineWidth,
      tool
    );

    stompClientRef.current?.connected &&
      stompClientRef.current.publish({
        destination: "/app/draw",
        body: JSON.stringify({
          type: "draw",
          sessionId: SESSION_ID,
          userId,
          startX: lastPos.current.x,
          startY: lastPos.current.y,
          endX: currentPos.x,
          endY: currentPos.y,
          color,
          lineWidth,
          tool,
        }),
      });

    lastPos.current = currentPos;
  };

  const stopDrawing = () => setIsDrawing(false);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleClear = async () => {
    clearCanvas();

    stompClientRef.current?.connected &&
      stompClientRef.current.publish({
        destination: "/app/draw",
        
        body: JSON.stringify({
          type: "clear",
          sessionId: SESSION_ID,
          userId,
        }),
      });

    await axios.delete(`${API_URL}/api/whiteboard/clear/${SESSION_ID}`);
  };

  /* =========================
     UI
  ========================== */
  return (
    <div className="app">
      <div className="header">
        <h1>Collaborative Canvas</h1>
        <span>{connectedUsers} active</span>
      </div>

      <div className="toolbar">
        <div>
          <label>Brush</label>
          <input
            type="range"
            min="1"
            max="40"
            value={lineWidth}
            onChange={(e) => setLineWidth(+e.target.value)}
          />
          <span>{lineWidth}px</span>
        </div>

        <div>
          <label>Color</label>
          <input
            type="color"
            value={color}
            onChange={(e) => {
              setColor(e.target.value);
              setTool("draw");
            }}
          />
        </div>

        <button
          className={tool === "draw" ? "active" : ""}
          onClick={() => setTool("draw")}
        >
          ✏️ Draw
        </button>

        <button
          className={tool === "erase" ? "active" : ""}
          onClick={() => setTool("erase")}
        >
          🧽 Eraser
        </button>

        <button onClick={handleClear}>🗑 Clear</button>
      </div>

      <canvas ref={canvasRef} className="canvas" onMouseDown={startDrawing}
       onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}/>
    </div>
  );
}

export default App;
