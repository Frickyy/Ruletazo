import api from "./api.js";

/** Salas en grupo: ver backend/app/routers/rooms.py. */
export async function createRoom(games) {
  const { data } = await api.post("/rooms", { games: games.map(({ appid, name }) => ({ appid, name })) });
  return data;
}

export async function fetchRoom(code) {
  const { data } = await api.get(`/rooms/${encodeURIComponent(code)}`);
  return data;
}

export async function joinRoom(code) {
  const { data } = await api.post(`/rooms/${encodeURIComponent(code)}/join`);
  return data;
}

export async function setRoomVeto(code, appid, vetoed) {
  const { data } = await api.put(`/rooms/${encodeURIComponent(code)}/veto`, { appid, vetoed });
  return data;
}

export async function spinRoom(code) {
  const { data } = await api.post(`/rooms/${encodeURIComponent(code)}/spin`);
  return data;
}
