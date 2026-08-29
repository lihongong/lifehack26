import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import AppHeader from "../components/AppHeader.jsx";
import { getPublicProfile } from "../api/participantApi.js";

export default function PublicProfilePage() {
  const { publicId } = useParams();
  const [state, setState] = useState({ participant: null, error: null });
  useEffect(() => { getPublicProfile(publicId).then((data) => setState({ participant: data.participant, error: null })).catch((error) => setState({ participant: null, error })); }, [publicId]);
  return <main className="app-shell"><AppHeader /><section className="profile-page public-profile">{state.error ? <p role="alert">Participant not found.</p> : !state.participant ? <p>Loading public profile…</p> : <><div className="avatar large" aria-hidden="true">{state.participant.displayName.slice(0, 1).toUpperCase()}</div><p className="eyebrow">PUBLIC PARTICIPANT</p><h1>{state.participant.displayName}</h1><span className="verified">✓ NUS verified</span><p className="privacy-note">Only this Participant’s public identity is shown.</p></>}</section></main>;
}
