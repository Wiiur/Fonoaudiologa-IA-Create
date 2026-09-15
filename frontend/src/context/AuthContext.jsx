import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  // 1. Busca o usuário salvo no navegador (localStorage) para a sessão não cair no F5
  const [user, setUserState] = useState(() => {
    try {
      const savedUser = localStorage.getItem("@vox_user");
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  // 2. Função inteligente que salva o usuário tanto no React quanto no Navegador
  const setUser = (userData) => {
    setUserState(userData);
    if (userData) {
      localStorage.setItem("@vox_user", JSON.stringify(userData));
    } else {
      localStorage.removeItem("@vox_user");
    }
  };

  const checkAuth = useCallback(async () => {
    try {
      if (!user) {
        const { data } = await api.get("/auth/me");
        setUser(data);
      }
    } catch (e) {
      // Silencioso se estiver offline ou sem sessão
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    checkAuth();
  }, [checkAuth]);

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    setUser(null); // Limpa tudo ao sair
    window.location.href = "/";
  };

  const setRole = async (role) => {
    const { data } = await api.post("/auth/role", { role });
    setUser(data);
    return data;
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, checkAuth, logout, setRole }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);