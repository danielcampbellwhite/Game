import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { api, getToken, setToken } from '../api.js';
import { closeEventStream } from '../hooks/useEventStream.js';

const Ctx = createContext(null);

export function GameProvider({ children }) {
  const [token, setTokenState] = useState(getToken());
  const [character, setCharacter] = useState(null);
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!getToken()) return null;
    try {
      const data = await api.get('/character');
      setCharacter(data.character);
      setLog(data.log || []);
      setError(null);
      return data.character;
    } catch (e) {
      if (e.status === 404) {
        setCharacter(null);
        return null;
      }
      if (e.status === 401) {
        setToken(null);
        setTokenState(null);
        setCharacter(null);
      }
      setError(e.message);
      return null;
    }
  }, []);

  // Apply optimistic character update from any action's response.
  const updateFromResponse = useCallback((resp) => {
    if (resp?.character) setCharacter(resp.character);
    return resp;
  }, []);

  // Initial load + 30s poll
  useEffect(() => {
    if (!token) return;
    refresh();
    pollRef.current = setInterval(refresh, 30000);
    return () => clearInterval(pollRef.current);
  }, [token, refresh]);

  // Re-tick the visible vitals every second from cached values (cosmetic).
  // Server is source of truth and is polled every 30s.

  const login = async (username, password) => {
    setLoading(true);
    try {
      const data = await api.post('/auth/login', { username, password });
      setToken(data.token);
      setTokenState(data.token);
      await refresh();
      return data;
    } finally { setLoading(false); }
  };

  const register = async (username, email, password) => {
    setLoading(true);
    try {
      const data = await api.post('/auth/register', { username, email, password });
      setToken(data.token);
      setTokenState(data.token);
      return data;
    } finally { setLoading(false); }
  };

  const logout = () => {
    closeEventStream();
    setToken(null);
    setTokenState(null);
    setCharacter(null);
    setLog([]);
  };

  const createCharacter = async (payload) => {
    const data = await api.post('/character/create', payload);
    setCharacter(data.character);
    await refresh();
    return data;
  };

  const value = {
    token, character, log, loading, error,
    login, register, logout, refresh, createCharacter,
    updateFromResponse, setLog,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGame() {
  return useContext(Ctx);
}
