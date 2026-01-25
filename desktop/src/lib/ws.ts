import { get } from 'svelte/store';
import { hubUrl } from '../stores/hub';
import type { WSMessage } from './types';

type MessageHandler = (event: string, data: unknown) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private projectId: number | null = null;
  private handlers: MessageHandler[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;

  connect(projectId: number): void {
    if (this.ws && this.projectId === projectId) {
      return; // Already connected to this project
    }

    this.disconnect();
    this.projectId = projectId;

    const baseUrl = get(hubUrl);
    const wsUrl = baseUrl.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');

    try {
      this.ws = new WebSocket(`${wsUrl}/projects/${projectId}/subscribe`);

      this.ws.onopen = () => {
        console.log(`WebSocket connected to project ${projectId}`);
        this.reconnectDelay = 1000;
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          this.handlers.forEach(handler => handler(message.event, message.data));
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.scheduleReconnect();
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.projectId = null;
  }

  private scheduleReconnect(): void {
    if (this.projectId && !this.reconnectTimer) {
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        if (this.projectId) {
          this.connect(this.projectId);
        }
      }, this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.push(handler);
    return () => {
      const index = this.handlers.indexOf(handler);
      if (index !== -1) {
        this.handlers.splice(index, 1);
      }
    };
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsClient = new WebSocketClient();
