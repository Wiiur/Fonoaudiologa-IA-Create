import axios from "axios";

// Puxa a URL perfeitamente do seu .env
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Mantém a estrutura original do seu projeto que usa o sufixo /api
const BASE_URL = `${BACKEND_URL}/api`;

// 1. Exporta o API maiúsculo (Para agradar os arquivos antigos do projeto)
export const API = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});

// 2. Exporta o api minúsculo (Para agradar a nossa nova tela Patients.jsx)
export const api = API;

// 3. HACK DE DESENVOLVEDOR: Injetamos o usuário falso para a nuvem não bloquear
API.interceptors.request.use((config) => {
  config.headers['user-id'] = 'doc_mock_123';
  return config;
});

export default API;