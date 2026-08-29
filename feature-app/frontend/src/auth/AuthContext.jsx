import { createContext, useContext, useEffect, useState } from "react";
import { getSession } from "../api/participantApi.js";

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [participant, setParticipant] = useState(null);
  const [loading, setLoading] = useState(true);
  const refresh = async () => {
    try {
      const data = await getSession();
      setParticipant(data.participant);
      return data.participant;
    } catch (error) {
      if (error.status !== 401) console.error(error);
      setParticipant(null);
      return null;
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refresh();
  }, []);
  return (
    <AuthContext.Provider value={{ participant, loading, refresh, setParticipant }}>
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
