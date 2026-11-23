import { type FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Captions, CircleStop, Clock, Loader2, MessageSquare, Mic, MicOff, PhoneCall, Send, ShieldCheck, Sparkles, Video, Volume2 } from "lucide-react";
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
  candidateName: string;
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
  const navigate = useNavigate();
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const activeRef = useRef(false);
  const speakingRef = useRef(false);
  const processingRef = useRef(false);
  const mutedRef = useRef(false);
  const finalPromptAskedRef = useRef(false);
  const endingRef = useRef(false);
  const requestNextTurnRef = useRef<(candidateText?: string, directorNote?: string) => Promise<void>>(async () => {});
  const endInterviewRef = useRef<() => Promise<void>>(async () => {});
  const selectedVoiceRef = useRef("");
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  const [interview, setInterview] = useState<Interview | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "connecting" | "live" | "ending" | "complete" | "error">("loading");
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState("Preparing the room");
  const [error, setError] = useState("");
  const [turns, setTurns] = useState<InterviewTurn[]>([]);
  const [liveCandidateText, setLiveCandidateText] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  const [currentTime, setCurrentTime] = useState("--:--");
  const [remainingSeconds, setRemainingSeconds] = useState(600);

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
      if (data.interview.status === "COMPLETED") {
        navigate(`/interview/${interviewId}/report`, { replace: true });
        return;
      }
      setPhase(data.interview.status === "COMPLETED" ? "complete" : "ready");
      setStatus("Ready when you are");
    }

    void load();
    return () => cleanup();
  }, [interviewId, navigate]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;

    const loadVoices = () => {
      const languageVoices = window.speechSynthesis
        .getVoices()
        .filter((voice) => isVoiceForLanguage(voice, interview?.language || "English"));
      const clearInterviewVoices = languageVoices.filter(isClearInterviewVoice);
      const availableVoices = (clearInterviewVoices.length > 0 ? clearInterviewVoices : languageVoices).sort(
        (first, second) => voiceQualityScore(second, interview?.language || "English") - voiceQualityScore(first, interview?.language || "English"),
      );

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

  useEffect(() => {
    const updateTime = () => setCurrentTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    updateTime();
    const timer = window.setInterval(updateTime, 30_000);
    return () => window.clearInterval(timer);
  }, []);

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
          (first, second) => voiceQualityScore(second, interview?.language || "English") - voiceQualityScore(first, interview?.language || "English"),
        )[0];

      if (preferredVoice) utterance.voice = preferredVoice;
      utterance.lang = preferredVoice?.lang || speechLanguageFor(interview?.language || "English");
      utterance.rate = interview?.language === "Hindi" ? 0.86 : 0.9;
      utterance.pitch = 1.02;
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

  useEffect(() => {
    if (phase !== "live") return;

    const timer = window.setInterval(() => {
      setRemainingSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "live") return;
    if (remainingSeconds <= 60 && remainingSeconds > 0 && !finalPromptAskedRef.current && !processingRef.current && !speakingRef.current) {
      finalPromptAskedRef.current = true;
      void requestNextTurnRef.current(undefined, "Only one minute remains. Briefly announce wrap-up and ask one final pinpoint question based on the strongest gap in the conversation.");
    }
    if (remainingSeconds === 0) {
      void endInterviewRef.current();
    }
  }, [phase, remainingSeconds]);

  async function requestNextTurn(candidateText?: string, directorNote?: string) {
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
        body: JSON.stringify({ text: candidateText, directorNote }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Could not generate the next question.");
      }
      if (endingRef.current) {
        processingRef.current = false;
        return;
      }

      setTurns((current) => [...current, { speaker: "interviewer", text: data.reply }]);
      processingRef.current = false;
      if (endingRef.current) return;
      await speak(data.reply);
      if (activeRef.current && !mutedRef.current) {
        window.setTimeout(startListening, 250);
      }
    } catch (requestError) {
      processingRef.current = false;
      if (endingRef.current) return;
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

  async function submitChatMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = chatDraft.trim();
    if (!message || processingRef.current || phase === "ending" || phase === "complete") return;

    setChatDraft("");
    if (isEndInterviewCommand(message)) {
      await finishByVoiceCommand(message);
      return;
    }
    await requestNextTurn(message);
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
      endingRef.current = false;
      activeRef.current = true;
      mutedRef.current = false;
      finalPromptAskedRef.current = false;
      setRemainingSeconds(600);
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
    if (endingRef.current) return;
    endingRef.current = true;
    setPhase("ending");
    setStatus("Creating scorecard");
    cleanup();
    const response = await fetch(`/api/interviews/${interviewId}/complete`, { method: "POST" });
    const data = await response.json();
    if (response.ok) {
      setInterview(data.interview);
      setPhase("complete");
      setStatus("Scorecard ready");
      navigate(`/interview/${interviewId}/report`);
    } else {
      setError(data.error || "Could not complete interview.");
      setPhase("error");
    }
  }

  requestNextTurnRef.current = requestNextTurn;
  endInterviewRef.current = endInterview;

  return (
    <main className="meeting-shell">
      <header className="meeting-topbar">
        <div className="meeting-title">
          <button className="ghost-button meeting-back" onClick={() => navigate("/")}>
            <ArrowLeft size={16} /> Dashboard
          </button>
          <span />
          <strong>{interview ? `${interview.role} Mock Interview` : "Mentorque Interview"}</strong>
          <b>Mentorque</b>
        </div>
        <div className="meeting-status">
          <span className={clsx("proctor-pill", phase === "live" && "active")}>
            <ShieldCheck size={15} /> {phase === "live" ? "Interview live" : "Ready"}
          </span>
          <span className="meeting-timer"><Clock size={15} /> {formatTimer(remainingSeconds)}</span>
        </div>
      </header>

      <section className="meeting-layout">
        <section className="meeting-stage">
          <div className="stage-subtitle">
            <Sparkles size={18} />
            <span>{status}</span>
          </div>

          <div className="meeting-grid">
            <article className={clsx("participant-tile ai-tile", speakingRef.current && "speaking")}>
              <div className="participant-avatar-wrap">
                <span className="speaking-ring" />
                <img className="photo-avatar" src="/ai-interviewer-avatar.svg" alt="AI interviewer Ava" width={126} height={126} fetchPriority="high" />
              </div>
              <div className="participant-caption">
                <strong>Ava · AI Interviewer</strong>
                <span>{speakingRef.current ? "Speaking" : processingRef.current ? "Thinking" : "Ready"}</span>
              </div>
            </article>

            <article className={clsx("participant-tile candidate-tile", liveCandidateText && "speaking")}>
              <div className="candidate-orb">
                <span>{candidateInitial(interview?.candidateName)}</span>
                <Mic size={28} />
              </div>
              <div className="participant-caption">
                <strong>{interview?.candidateName || "You"}</strong>
                <span>{liveCandidateText ? "Speaking" : muted ? "Muted" : "Listening"}</span>
              </div>
            </article>
          </div>

          <div className="invigilator-card">
            <img src="/ai-interviewer-avatar.svg" alt="" width={48} height={48} />
            <div>
              <strong>AI Invigilator</strong>
              <span>Transcript, voice, and progress are monitored for your scorecard.</span>
            </div>
          </div>

          {interview && (
            <div className="meeting-details">
              <span>{interview.level}</span>
              <span>{interview.language}</span>
              <span>{interview.focus}</span>
            </div>
          )}
        </section>

        <aside className="meeting-side-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Interview transcript</p>
              <h2><Captions size={19} /> Live transcript</h2>
            </div>
            <span>{turns.length}</span>
          </div>

          <div className="transcript-alert">
            <MessageSquare size={17} />
            <span>Captions may contain minor speech-recognition mistakes. AI responses still use full context.</span>
          </div>

          <div className="meeting-transcript-feed" aria-live="polite">
            {turns.length === 0 && !liveCandidateText && (
              <div className="empty-transcript">
                <Volume2 size={22} />
                <p>Start the interview and Ava will ask for your intro first.</p>
              </div>
            )}
            {turns.map((turn, index) => (
              <article className={clsx("meeting-transcript-turn", turn.speaker)} key={turn.id || `${turn.speaker}-${index}`}>
                <span>{turn.speaker === "interviewer" ? "Ava" : "You"}</span>
                <p>{turn.text}</p>
              </article>
            ))}
            {liveCandidateText && (
              <article className="meeting-transcript-turn candidate live-caption">
                <span>You · speaking</span>
                <p>{liveCandidateText}</p>
              </article>
            )}
            <div ref={transcriptEndRef} />
          </div>

          <form className="chat-fallback" onSubmit={submitChatMessage}>
            <label htmlFor="chat-fallback-input">Chat fallback</label>
            <div>
              <input
                id="chat-fallback-input"
                value={chatDraft}
                onChange={(event) => setChatDraft(event.target.value)}
                placeholder="Type only if mic fails..."
                disabled={processingRef.current || phase === "ending" || phase === "complete"}
              />
              <button type="submit" disabled={!chatDraft.trim() || processingRef.current || phase === "ending" || phase === "complete"}>
                <Send size={17} />
              </button>
            </div>
          </form>
        </aside>
      </section>

      <section className="meeting-controlbar">
        <div className="meeting-footer-title">
          <strong>Mentorque AI Interview</strong>
          <span>{currentTime}</span>
        </div>

        <div className="meeting-controls">
          {(phase === "connecting" || phase === "ending" || phase === "loading") && (
            <button className="round-button meeting-round" disabled>
              <Loader2 className="spin" size={22} />
            </button>
          )}
          {phase === "ready" && (
            <button className="call-button meeting-start" onClick={startInterview}>
              <PhoneCall size={22} /> Start interview
            </button>
          )}
          {phase === "live" && (
            <>
              <button className="round-button meeting-round" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} title={muted ? "Unmute" : "Mute"}>
                {muted ? <MicOff size={22} /> : <Mic size={22} />}
              </button>
              <button className="round-button meeting-round" disabled aria-label="Camera placeholder" title="Voice-first interview">
                <Video size={22} />
              </button>
              <button className="end-button meeting-end" onClick={endInterview}>
                <CircleStop size={21} /> End Interview
              </button>
            </>
          )}
        </div>

        <div className="meeting-audio">
          <span><Volume2 size={16} /> Voice auto-selected</span>
        </div>
      </section>

      {phase === "error" && (
        <div className="error-panel meeting-error">
          <strong>Something needs attention</strong>
          <p>{error}</p>
        </div>
      )}

    </main>
  );
}

function voiceQualityScore(voice: SpeechSynthesisVoice, language: Interview["language"]) {
  const voiceName = voice.name.toLowerCase();
  const voiceLang = voice.lang.toLowerCase();
  let score = voiceLang === "en-us" ? 20 : 10;

  if (language === "English" && voiceLang === "en-in") score -= 45;
  if (language === "English" && (voiceLang === "en-us" || voiceLang === "en-gb")) score += 35;
  if (language === "Hinglish" && voiceLang === "en-in") score += 80;
  if (language === "Hindi" && voiceLang.startsWith("hi")) score += 120;
  if (/natural|premium|enhanced/.test(voiceName)) score += 100;
  if (/google us english/.test(voiceName)) score += 95;
  if (language !== "English" && /google हिन्दी|lekha|kalpana|heera|rishi/.test(voiceName)) score += 95;
  if (language === "English" && /samantha|daniel|allison|ava/.test(voiceName)) score += 120;
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
  const noveltyVoice = /bad news|good news|bahh|bells|boing|bubbles|cellos|jester|organ|superstar|trinoids|whisper|wobble|zarvox|junior|fred|ralph|albert|grandma|grandpa|rocko/.test(
    voiceName,
  );

  return !noveltyVoice;
}

function speechLanguageFor(language: Interview["language"]) {
  if (language === "Hindi") return "hi-IN";
  if (language === "Hinglish") return "en-IN";
  return "en-US";
}

function formatTimer(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remaining = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
}

function candidateInitial(name?: string) {
  return name?.trim().charAt(0).toUpperCase() || "Y";
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
