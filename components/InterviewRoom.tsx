"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Captions, CircleStop, Loader2, Mic, MicOff, PhoneCall, Sparkles, Volume2 } from "lucide-react";
import clsx from "clsx";

type InterviewTurn = {
  id?: string;
  speaker: "candidate" | "interviewer";
  text: string;
};

type Interview = {
  id: string;
  role: string;
  level: string;
  language: "English" | "Hindi" | "Hinglish";
  focus: string;
  status: "CREATED" | "LIVE" | "COMPLETED";
  score: number | null;
  summary: string | null;
  strengths: string[];
  improvements: string[];
  nextSteps: string[];
  turns: InterviewTurn[];
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: {
        transcript: string;
      };
    };
  };
};

type SpeechRecognitionErrorEventLike = Event & {
  error: string;
};

type SpeechRecognitionLike = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export function InterviewRoom({ interviewId }: { interviewId: string }) {
  const router = useRouter();
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const activeRef = useRef(false);
  const speakingRef = useRef(false);
  const processingRef = useRef(false);
  const mutedRef = useRef(false);
  const selectedVoiceRef = useRef("");
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  const [interview, setInterview] = useState<Interview | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "connecting" | "live" | "ending" | "complete" | "error">("loading");
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState("Preparing the room");
  const [error, setError] = useState("");
  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [liveCandidateText, setLiveCandidateText] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState("");

  useEffect(() => {
    async function load() {
      const response = await fetch(`/api/interviews/${interviewId}`);
      if (!response.ok) {
        setError("Could not load this interview.");
        setPhase("error");
        return;
      }
      const data = await response.json();
      setInterview(data.interview);
      setTurns(data.interview.turns || []);
      setPhase(data.interview.status === "COMPLETED" ? "complete" : "ready");
      setStatus("Ready when you are");
    }

    void load();
    return () => cleanup();
  }, [interviewId]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;

    const loadVoices = () => {
      const languageVoices = window.speechSynthesis
        .getVoices()
        .filter((voice) => isVoiceForLanguage(voice, interview?.language || "English"));
      const clearInterviewVoices = languageVoices.filter(isClearInterviewVoice);
      const availableVoices = (clearInterviewVoices.length > 0 ? clearInterviewVoices : languageVoices).sort(
        (first, second) => voiceQualityScore(second) - voiceQualityScore(first),
      );

      setVoices(availableVoices);
      setSelectedVoice((current) => {
        if (current && availableVoices.some((voice) => voice.voiceURI === current)) return current;
        const savedVoice = window.localStorage.getItem("mentorque-voice");
        if (savedVoice && availableVoices.some((voice) => voice.voiceURI === savedVoice)) return savedVoice;
        return availableVoices[0]?.voiceURI || "";
      });
    };

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, [interview?.language]);

  useEffect(() => {
    selectedVoiceRef.current = selectedVoice;
    if (selectedVoice) window.localStorage.setItem("mentorque-voice", selectedVoice);
  }, [selectedVoice]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns, liveCandidateText]);

  function cleanup() {
    activeRef.current = false;
    processingRef.current = false;
    speakingRef.current = false;
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    window.speechSynthesis?.cancel();
  }

  function startListening() {
    if (!activeRef.current || mutedRef.current || speakingRef.current || processingRef.current) return;

    try {
      setStatus("Listening");
      recognitionRef.current?.start();
    } catch {
      window.setTimeout(() => {
        if (activeRef.current && !mutedRef.current) startListening();
      }, 300);
    }
  }

  function speak(text: string) {
    return new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      const languageVoices = voices.filter((voice) => isVoiceForLanguage(voice, interview?.language || "English"));
      const clearInterviewVoices = languageVoices.filter(isClearInterviewVoice);
      const preferredVoice =
        voices.find((voice) => voice.voiceURI === selectedVoiceRef.current) ||
        (clearInterviewVoices.length > 0 ? clearInterviewVoices : languageVoices).sort(
          (first, second) => voiceQualityScore(second) - voiceQualityScore(first),
        )[0];

      if (preferredVoice) utterance.voice = preferredVoice;
      utterance.lang = preferredVoice?.lang || speechLanguageFor(interview?.language || "English");
      utterance.rate = interview?.language === "Hindi" ? 0.9 : 0.94;
      utterance.pitch = 1;
      utterance.volume = 1;
      utterance.onstart = () => {
        speakingRef.current = true;
        setStatus("Interviewer is speaking");
      };
      utterance.onend = () => {
        speakingRef.current = false;
        resolve();
      };
      utterance.onerror = () => {
        speakingRef.current = false;
        reject(new Error("Browser speech output failed."));
      };

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    });
  }

  async function requestNextTurn(candidateText?: string) {
    processingRef.current = true;
    if (candidateText) {
      setTurns((current) => [...current, { speaker: "candidate", text: candidateText }]);
      setLiveCandidateText("");
    }
    setStatus(candidateText ? "Interviewer is thinking" : "Interviewer is joining");

    try {
      const response = await fetch(`/api/interviews/${interviewId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: candidateText }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not generate the next question.");
      }

      setTurns((current) => [...current, { speaker: "interviewer", text: data.reply }]);
      processingRef.current = false;
      await speak(data.reply);
      if (activeRef.current && !mutedRef.current) {
        window.setTimeout(startListening, 250);
      }
    } catch (requestError) {
      processingRef.current = false;
      activeRef.current = false;
      setError(requestError instanceof Error ? requestError.message : "The interview loop stopped.");
      setPhase("error");
    }
  }

  async function finishByVoiceCommand(candidateText: string) {
    processingRef.current = true;
    setTurns((current) => [...current, { speaker: "candidate", text: candidateText }]);
    setLiveCandidateText("");
    setStatus("Ending interview by voice");
    await endInterview();
  }

  function configureRecognition() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      throw new Error("Voice recognition is not supported here. Use the latest Chrome or Edge.");
    }

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = speechLanguageFor(interview?.language || "English");

    recognition.onresult = (event) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let resultIndex = event.resultIndex; resultIndex < event.results.length; resultIndex += 1) {
        const transcript = event.results[resultIndex]?.[0]?.transcript || "";
        if (event.results[resultIndex]?.isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      setLiveCandidateText((finalTranscript || interimTranscript).trim());
      if (finalTranscript.trim() && activeRef.current) {
        recognition.stop();
        if (isEndInterviewCommand(finalTranscript)) {
          void finishByVoiceCommand(finalTranscript.trim());
          return;
        }
        void requestNextTurn(finalTranscript.trim());
      }
    };

    recognition.onerror = (event) => {
      if (!activeRef.current || event.error === "aborted") return;
      if (event.error === "no-speech") {
        setLiveCandidateText("");
        setStatus("I am listening");
        return;
      }
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        activeRef.current = false;
        setError("Microphone or browser speech permission was denied.");
        setPhase("error");
        return;
      }
      setStatus("Listening again");
    };

    recognition.onend = () => {
      if (activeRef.current && !mutedRef.current && !speakingRef.current && !processingRef.current) {
        window.setTimeout(startListening, 350);
      }
    };

    recognitionRef.current = recognition;
  }

  async function startInterview() {
    try {
      setError("");
      setPhase("connecting");
      setStatus("Checking voice support");

      if (!("speechSynthesis" in window)) {
        throw new Error("Speech output is not supported in this browser.");
      }

      configureRecognition();
      activeRef.current = true;
      mutedRef.current = false;
      setMuted(false);
      setPhase("live");
      await requestNextTurn();
    } catch (startError) {
      cleanup();
      setError(startError instanceof Error ? startError.message : "Could not start the interview.");
      setPhase("error");
    }
  }

  function toggleMute() {
    const nextMuted = !mutedRef.current;
    mutedRef.current = nextMuted;
    setMuted(nextMuted);

    if (nextMuted) {
      recognitionRef.current?.abort();
      setLiveCandidateText("");
      setStatus("Microphone paused");
    } else if (activeRef.current && !speakingRef.current && !processingRef.current) {
      startListening();
    }
  }

  async function endInterview() {
    setPhase("ending");
    setStatus("Creating scorecard");
    cleanup();
    const response = await fetch(`/api/interviews/${interviewId}/complete`, { method: "POST" });
    const data = await response.json();
    if (response.ok) {
      setInterview(data.interview);
      setPhase("complete");
      setStatus("Scorecard ready");
    } else {
      setError(data.error || "Could not complete interview.");
      setPhase("error");
    }
  }

  return (
    <main className="room-shell">
      <header className="room-topbar">
        <button className="ghost-button" onClick={() => router.push("/")}>
          <ArrowLeft size={16} /> Dashboard
        </button>
        <span className={clsx("live-dot", phase === "live" && "active")} />
      </header>

      <section className="voice-stage">
        <p className="eyebrow">{interview ? `${interview.level} ${interview.role}` : "Voice room"}</p>
        <h1>{status}</h1>

        <div className={clsx("interviewer-card", phase, speakingRef.current && "speaking")}>
          <div className="avatar-orbit" aria-hidden="true">
            <span />
            <span />
          </div>
          <div className="interviewer-avatar" aria-label="AI interviewer avatar">
            <div className="avatar-face">
              <span className="avatar-hair" />
              <span className="avatar-eye left" />
              <span className="avatar-eye right" />
              <span className="avatar-nose" />
              <span className="avatar-mouth" />
            </div>
          </div>
          <div className="interviewer-meta">
            <span><Sparkles size={14} /> Mentorque AI interviewer</span>
            <strong>{phase === "live" ? `${interview?.language || "English"} adaptive voice session` : "Ready for a natural interview"}</strong>
          </div>
          <div className={clsx("voice-visual", phase)}>
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>

        {interview && <p className="room-focus">{interview.focus}</p>}

        {(phase === "ready" || phase === "live") && voices.length > 0 && (
          <label className="voice-picker">
            <span><Volume2 size={15} /> Interviewer voice</span>
            <select value={selectedVoice} onChange={(event) => setSelectedVoice(event.target.value)}>
              {voices.map((voice, index) => (
                <option value={voice.voiceURI} key={`${voice.voiceURI}-${voice.name}`}>
                  {index === 0 ? "Recommended · " : ""}{voice.name} ({voice.lang})
                </option>
              ))}
            </select>
          </label>
        )}

        {phase === "ready" && (
          <button className="call-button" onClick={startInterview}>
            <PhoneCall size={24} /> Start interview
          </button>
        )}

        {(phase === "connecting" || phase === "ending" || phase === "loading") && (
          <button className="call-button muted" disabled>
            <Loader2 className="spin" size={24} /> Please wait
          </button>
        )}

        {phase === "live" && (
          <div className="call-controls">
            <button className="round-button" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} title={muted ? "Unmute" : "Mute"}>
              {muted ? <MicOff size={22} /> : <Mic size={22} />}
            </button>
            <button className="end-button" onClick={endInterview}>
              <CircleStop size={22} /> End
            </button>
            <button className="round-button" disabled aria-label="Browser audio output" title="Browser audio output">
              <Volume2 size={22} />
            </button>
          </div>
        )}

        {phase === "error" && (
          <div className="error-panel">
            <strong>Something needs attention</strong>
            <p>{error}</p>
          </div>
        )}
      </section>

      {(phase === "live" || phase === "ending" || (phase === "complete" && turns.length > 0)) && (
        <section className="transcript-panel" aria-live="polite">
          <div className="transcript-heading">
            <div>
              <p className="eyebrow">Live captions</p>
              <h2><Captions size={21} /> Conversation transcript</h2>
            </div>
            <span>{turns.length} turns</span>
          </div>
          <div className="transcript-feed">
            {turns.map((turn, index) => (
              <article className={clsx("transcript-turn", turn.speaker)} key={turn.id || `${turn.speaker}-${index}`}>
                <span>{turn.speaker === "interviewer" ? "Interviewer" : "You"}</span>
                <p>{turn.text}</p>
              </article>
            ))}
            {liveCandidateText && (
              <article className="transcript-turn candidate live-caption">
                <span>You · speaking</span>
                <p>{liveCandidateText}</p>
              </article>
            )}
            <div ref={transcriptEndRef} />
          </div>
        </section>
      )}

      {phase === "complete" && interview && (
        <section className="scorecard">
          <div className="score-hero">
            <div className="score-ring" style={{ "--score": `${interview.score ?? 0}%` } as CSSProperties}>
              <strong>{interview.score ?? 0}</strong>
              <span>/100</span>
            </div>
            <div>
              <p className="eyebrow">Interview scorecard</p>
              <h2>{interview.summary || "Interview complete"}</h2>
              <p className="score-note">Review what went well, what needs work, and exactly how to improve before your next round.</p>
            </div>
          </div>
          <ScoreBars score={interview.score ?? 0} />
          <div className="score-grid">
            <ScoreList title="Good parts" items={interview.strengths} tone="good" />
            <ScoreList title="Bad / weak parts" items={interview.improvements} tone="weak" />
            <ScoreList title="How to improve" items={interview.nextSteps} tone="next" />
          </div>
        </section>
      )}
    </main>
  );
}

function voiceQualityScore(voice: SpeechSynthesisVoice) {
  const voiceName = voice.name.toLowerCase();
  let score = voice.lang.toLowerCase() === "en-us" ? 20 : 10;

  if (/natural|premium|enhanced/.test(voiceName)) score += 100;
  if (/google us english/.test(voiceName)) score += 95;
  if (/google हिन्दी|lekha|kalpana|heera|rishi/.test(voiceName)) score += 95;
  if (/microsoft (aria|jenny|ava|guy|davis)/.test(voiceName)) score += 90;
  if (/samantha|ava|allison|daniel/.test(voiceName)) score += 80;
  if (/karen|moira|rishi|reed|shelley|sandy|flo/.test(voiceName)) score += 55;
  if (/google|microsoft/.test(voiceName)) score += 40;
  if (voice.localService) score += 8;

  return score;
}

function isVoiceForLanguage(voice: SpeechSynthesisVoice, language: Interview["language"]) {
  const voiceLang = voice.lang.toLowerCase();
  if (language === "Hindi") return voiceLang.startsWith("hi") || voiceLang === "en-in";
  if (language === "Hinglish") return voiceLang === "en-in" || voiceLang.startsWith("hi") || voiceLang.startsWith("en");
  return voiceLang.startsWith("en");
}

function isClearInterviewVoice(voice: SpeechSynthesisVoice) {
  const voiceName = voice.name.toLowerCase();
  const noveltyVoice = /bad news|bahh|bells|boing|bubbles|cellos|jester|organ|superstar|trinoids|whisper|wobble|zarvox|junior|fred|ralph|albert/.test(
    voiceName,
  );

  return !noveltyVoice;
}

function speechLanguageFor(language: Interview["language"]) {
  if (language === "Hindi") return "hi-IN";
  if (language === "Hinglish") return "en-IN";
  return "en-US";
}

function isEndInterviewCommand(text: string) {
  const normalized = text
    .toLowerCase()
    .replace(/[.,!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return [
    "end my interview",
    "end interview",
    "finish my interview",
    "stop interview",
    "complete my interview",
    "interview khatam",
    "mera interview khatam",
    "interview band",
    "बस इंटरव्यू खत्म",
    "मेरा इंटरव्यू खत्म",
    "इंटरव्यू खत्म",
    "इंटरव्यू बंद",
  ].some((command) => normalized.includes(command));
}

function ScoreBars({ score }: { score: number }) {
  const communication = Math.min(100, Math.max(35, score + 6));
  const depth = Math.min(100, Math.max(30, score - 4));
  const clarity = Math.min(100, Math.max(30, Math.round((communication + depth + score) / 3)));

  return (
    <div className="score-bars" aria-label="Interview performance chart">
      <ScoreBar label="Overall readiness" value={score} />
      <ScoreBar label="Communication clarity" value={communication} />
      <ScoreBar label="Answer depth" value={depth} />
      <ScoreBar label="Improvement priority" value={100 - clarity} invert />
    </div>
  );
}

function ScoreBar({ label, value, invert = false }: { label: string; value: number; invert?: boolean }) {
  return (
    <div className={clsx("score-bar", invert && "warning")}>
      <div>
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <i style={{ "--bar": `${value}%` } as CSSProperties} />
    </div>
  );
}

function ScoreList({ title, items, tone }: { title: string; items: string[]; tone: "good" | "weak" | "next" }) {
  return (
    <article className={clsx("score-list", tone)}>
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}
