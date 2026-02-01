import React from 'react';
import ReactDOM from 'react-dom/client';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './index.css';
import App from './App';
import { listenExecutionEvents } from '@/lib/api';
import { useOrchestraStore } from '@/lib/store';

void listenExecutionEvents({
  onChunk: (e) => {
    useOrchestraStore.getState().appendSessionOutput(e.sessionId, e.chunk);
  },
  onDone: (e) => {
    useOrchestraStore.getState().finishSession(e.sessionId, e.success, e.exitCode);
  },
  onError: (e) => {
    useOrchestraStore.getState().failSession(e.sessionId, e.message);
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ReactFlowProvider>
      <App />
    </ReactFlowProvider>
  </React.StrictMode>,
);

