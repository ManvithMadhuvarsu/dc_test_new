import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import ReactMarkdown from 'react-markdown';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

const blockedKeys = ['F12', 'PrintScreen'];
const BRAND_TITLE = 'Data Conquest Recruitment Assessment';

function App() {
  const [phase, setPhase] = useState('LOGIN');
  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [, setResult] = useState(null);
  const [violationReason, setViolationReason] = useState('');
  const [timeLeftMs, setTimeLeftMs] = useState(null);
  const [instructionsTimer, setInstructionsTimer] = useState(120); // 2 minutes in seconds

  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);

  const reportViolation = useCallback(async (reason) => {
    if (!session || phase === 'LOCKED' || phase === 'SUBMITTED') return;
    setViolationReason(reason);
    setPhase('LOCKED');
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch (error) {
        console.warn('Unable to exit fullscreen', error);
      }
    }
    try {
      const response = await fetch(`${API_BASE}/api/session/${session.sessionId}/violation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        console.error('Violation logging failed:', payload.message || 'Unknown error');
      }
    } catch (error) {
      console.error('Network error while logging violation:', error);
    }
  }, [session, phase]);

  useEffect(() => {
    if (phase !== 'IN_PROGRESS') return undefined;

    const killEvent = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        reportViolation('Tab switch detected');
      }
    };

    const onBlur = () => {
      reportViolation('Browser focus lost');
    };

    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        reportViolation('Exited fullscreen mode');
      }
    };

    const onKeydown = (event) => {
      const key = event.key;
      const ctrlCombo = event.ctrlKey || event.metaKey;
      const ctrlList = ['c', 'v', 'x', 's', 'p', 'a', 'r'];
      const shiftCombos = event.ctrlKey && event.shiftKey && ['I', 'J', 'C', 'K'].includes(key.toUpperCase());
      const altCombos = event.altKey && (key === 'Tab' || key === 'F4');

      if (
        blockedKeys.includes(key) ||
        ctrlCombo && ctrlList.includes(key.toLowerCase()) ||
        shiftCombos ||
        altCombos
      ) {
        killEvent(event);
        reportViolation('Restricted keyboard shortcut');
      }
    };

    ['copy', 'cut', 'paste', 'contextmenu', 'selectstart', 'dragstart'].forEach((evt) => {
      document.addEventListener(evt, killEvent);
    });

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('keydown', onKeydown, true);

    return () => {
      ['copy', 'cut', 'paste', 'contextmenu', 'selectstart', 'dragstart'].forEach((evt) => {
        document.removeEventListener(evt, killEvent);
      });
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('keydown', onKeydown, true);
    };
  }, [phase, reportViolation]);

  useEffect(() => {
    if (phase !== 'IN_PROGRESS' || !session?.expiresAt) {
      setTimeLeftMs(null);
      return undefined;
    }

    const evaluate = () => {
      const diff = new Date(session.expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeftMs(0);
        reportViolation('Exam time elapsed');
        return null;
      }
      setTimeLeftMs(diff);
      return diff;
    };

    evaluate();
    const interval = setInterval(() => {
      const diff = evaluate();
      if (diff === null) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [phase, session?.expiresAt, reportViolation]);

  useEffect(() => {
    if (phase !== 'IN_PROGRESS') return undefined;
    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [phase]);

  const fetchQuestions = useCallback(async (sessionId) => {
    try {
      const response = await fetch(`${API_BASE}/api/session/${sessionId}/questions`);
      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new Error('Server Error. The server returned an invalid response. Please try again.');
      }
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Question Loading Error. Unable to load exam questions. Please try again or contact support.');
      }
      setQuestions(payload.data);
    } catch (error) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error('Connection Error. Cannot connect to the server. Please ensure the backend is running.');
      }
      throw error;
    }
  }, []);

  const handleLogin = async (formData) => {
    setFeedback('');
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/session/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new Error('Server Error. The server returned an invalid response. Please check if the backend is running and try again.');
      }

      if (!response.ok || !payload.success) {
        const errorMessage = payload.message || 'Session Error. Unable to start exam session. Please check your credentials and try again.';
        throw new Error(errorMessage);
      }

      const sessionInfo = {
        sessionId: payload.data.sessionId,
        studentName: payload.data.studentName,
        studentId: payload.data.studentId,
        degree: payload.data.degree,
        course: payload.data.course,
        expiresAt: payload.data.expiresAt,
        durationMinutes: payload.data.durationMinutes,
      };
      setSession(sessionInfo);
      await fetchQuestions(payload.data.sessionId);
      setPhase('INSTRUCTIONS');
      setInstructionsTimer(120); // Reset to 2 minutes
    } catch (error) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        setFeedback('Connection Error. Cannot connect to the server. Please ensure the backend is running on ' + API_BASE);
      } else {
        setFeedback(error.message || 'An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (phase !== 'INSTRUCTIONS') return undefined;

    const interval = setInterval(() => {
      setInstructionsTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [phase]);

  const beginExam = async () => {
    if (instructionsTimer > 0) return; // Prevent starting before timer ends
    try {
      await document.documentElement.requestFullscreen();
    } catch (error) {
      console.warn('Fullscreen rejected', error);
    }
    setPhase('IN_PROGRESS');
  };

  const updateAnswer = (questionId, option) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: option,
    }));
  };

  const submitExam = async () => {
    setLoading(true);
    setFeedback('');
    try {
      const formattedAnswers = Object.entries(answers).map(([questionId, selectedOption]) => ({
        questionId: Number(questionId),
        selectedOption,
      }));

      const response = await fetch(`${API_BASE}/api/session/${session.sessionId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: formattedAnswers }),
      });

      let payload;
      try {
        payload = await response.json();
      } catch {
        throw new Error('Server Error. The server returned an invalid response. Please try again.');
      }

      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Submission Error. Unable to submit your exam. Please try again.');
      }

      setResult(payload.data);
      setPhase('SUBMITTED');
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch (error) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        setFeedback('Connection Error. Cannot connect to the server. Please ensure the backend is running.');
      } else {
        setFeedback(error.message || 'An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const resetExam = () => {
    setPhase('LOGIN');
    setSession(null);
    setQuestions([]);
    setAnswers({});
    setResult(null);
    setViolationReason('');
    setTimeLeftMs(null);
    setInstructionsTimer(120);
  };

  return (
    <div className="app-shell">
      <main className="surface">
        <header className="brand-header">
          <h1>{BRAND_TITLE}</h1>
          <p>Live monitoring • Zero tolerance for malpractice</p>
        </header>

        {session && (
          <div className="session-card">
            <div>
              <span className="label">Candidate</span>
              <strong>{session.studentName}</strong>
            </div>
            <div>
              <span className="label">College ID</span>
              <strong>{session.studentId}</strong>
            </div>
      <div>
              <span className="label">Program</span>
              <strong>
                {session.course || 'Not specified'}
                {session.degree ? ` • ${session.degree}` : ''}
              </strong>
            </div>
          </div>
        )}

        {feedback && (
          <div className="alert alert-centered">
            <p className="alert-message">{feedback}</p>
          </div>
        )}

        {phase === 'LOGIN' && (
          <LoginForm loading={loading} onSubmit={handleLogin} />
        )}

        {phase === 'INSTRUCTIONS' && (
          <InstructionsPage
            session={session}
            questionCount={questions.length}
            durationMinutes={session?.durationMinutes}
            timerSeconds={instructionsTimer}
            onBegin={beginExam}
          />
        )}

        {phase === 'IN_PROGRESS' && (
          <ExamBoard
            questions={questions}
            answers={answers}
            onAnswer={updateAnswer}
            onSubmit={submitExam}
            answeredCount={answeredCount}
            loading={loading}
            timeLeftMs={timeLeftMs}
          />
        )}

        {phase === 'LOCKED' && (
          <LockedState reason={violationReason} onReset={resetExam} />
        )}

        {phase === 'SUBMITTED' && (
          <ResultCard onReset={resetExam} />
        )}
      </main>
    </div>
  );
}

function LoginForm({ loading, onSubmit }) {
  const [form, setForm] = useState({
    name: '',
    degree: '',
    course: '',
    studentId: '',
    examPassword: '',
  });

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit(form);
  };

  return (
    <form className="card" onSubmit={handleSubmit}>
      <p className="subtitle">
        Authenticate with your student identity. College IDs must exist in the authorised roster.
      </p>
      <div className="grid grid-2">
        <label>
          <span>Name *</span>
          <input name="name" value={form.name} onChange={handleChange} required />
        </label>
        <label>
          <span>Degree</span>
          <input name="degree" value={form.degree} onChange={handleChange} />
        </label>
        <label>
          <span>Course *</span>
          <input name="course" value={form.course} onChange={handleChange} required />
        </label>
        <label>
          <span>College ID *</span>
          <input name="studentId" value={form.studentId} onChange={handleChange} required />
        </label>
      </div>
      <label>
        <span>Exam password *</span>
        <input
          type="password"
          name="examPassword"
          value={form.examPassword}
          onChange={handleChange}
          required
        />
      </label>
      <button type="submit" className="primary" disabled={loading}>
        {loading ? 'Starting...' : 'Enter secure room'}
      </button>
    </form>
  );
}

function InstructionsPage({ session, questionCount, durationMinutes = 0, timerSeconds, onBegin }) {
  const candidateName = session?.studentName || 'Candidate';
  const minutes = Math.floor(timerSeconds / 60);
  const seconds = timerSeconds % 60;
  const canStart = timerSeconds === 0;

  return (
    <section className="card instructions-card">
      <h2>Exam Instructions & Rules</h2>
      <p className="instructions-intro">
        <strong>{candidateName}</strong>, please read all instructions carefully. You must wait 2 minutes before starting the exam.
      </p>

      <div className="instructions-timer">
        <span className="timer-label">Mandatory Reading Time</span>
        <strong className="timer-display">
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </strong>
        {!canStart && <p className="timer-hint">Please read all instructions below before proceeding</p>}
      </div>

      <div className="instructions-content">
        <section className="instruction-section">
          <h3>Exam Details</h3>
          <ul>
            <li><strong>Total Questions:</strong> {questionCount}</li>
            <li><strong>Duration:</strong> {durationMinutes} minutes</li>
            <li><strong>Question Order:</strong> Randomized uniquely for each candidate</li>
            <li><strong>Attempts:</strong> One attempt only per student ID</li>
          </ul>
        </section>

        <section className="instruction-section">
          <h3>Allowed Actions</h3>
          <ul>
            <li>Select answers using radio buttons</li>
            <li>Review and change answers before submission</li>
            <li>Submit exam when all questions are answered</li>
          </ul>
        </section>

        <section className="instruction-section violation-section">
          <h3>Strictly Prohibited Actions (Will Immediately End Your Exam)</h3>
          <ul>
            <li><strong>Switching Tabs or Windows:</strong> Any tab switch or window change will immediately terminate your session</li>
            <li><strong>Copy/Paste Operations:</strong> Copying (Ctrl+C), Pasting (Ctrl+V), or Cutting (Ctrl+X) text is blocked and will end the exam</li>
            <li><strong>Printing:</strong> Attempting to print (Ctrl+P) will close your session</li>
            <li><strong>Screenshots:</strong> Taking screenshots (PrintScreen, Snipping Tool, etc.) is detected and will terminate the exam</li>
            <li><strong>Screen Recording:</strong> Any screen recording software usage will immediately end your session</li>
            <li><strong>Screen Sharing:</strong> Sharing your screen via any application will close the exam</li>
            <li><strong>Exiting Fullscreen:</strong> Leaving fullscreen mode will automatically end your attempt</li>
            <li><strong>Developer Tools:</strong> Opening browser developer tools (F12, Ctrl+Shift+I) will terminate the session</li>
            <li><strong>Keyboard Shortcuts:</strong> Restricted shortcuts (Ctrl+S, Ctrl+R, Alt+Tab, etc.) are blocked</li>
            <li><strong>Right-Click Menu:</strong> Context menu is disabled - right-clicking will end the exam</li>
            <li><strong>Text Selection:</strong> Selecting or highlighting text is not allowed</li>
            <li><strong>Page Refresh:</strong> Refreshing the page (F5, Ctrl+R) will close your session</li>
            <li><strong>Browser Navigation:</strong> Using back/forward buttons will terminate the exam</li>
          </ul>
        </section>

        <section className="instruction-section">
          <h3>Important Notes</h3>
          <ul>
            <li>Your session is continuously monitored for policy violations</li>
            <li>Any violation will <strong>permanently close</strong> your exam attempt</li>
            <li>You <strong>cannot retake</strong> the exam once your student ID has been used</li>
            <li>Your responses are automatically saved and cannot be modified after submission</li>
            <li>Results will be communicated separately after evaluation</li>
          </ul>
        </section>

        <section className="instruction-section warning-box">
          <h3>Zero Tolerance Policy</h3>
          <p>
            Data Conquest maintains a zero-tolerance policy for any form of malpractice. 
            Any detected violation will result in immediate session termination and permanent 
            disqualification from the recruitment process. Your actions are logged and monitored in real-time.
          </p>
        </section>
      </div>

      <div className="instructions-footer">
        <button 
          className={`primary ${canStart ? '' : 'disabled'}`} 
          onClick={onBegin}
          disabled={!canStart}
        >
          {canStart ? 'Start Exam' : `Please wait ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`}
        </button>
      </div>
    </section>
  );
}

function ExamBoard({
  questions,
  answers,
  onAnswer,
  onSubmit,
  answeredCount,
  loading,
  timeLeftMs,
}) {
  return (
    <section className="exam-board">
      <div className="exam-meta">
        <div>
          <p>Answer carefully. Monitoring is active.</p>
          <span>{answeredCount} / {questions.length} answered</span>
        </div>
        <div className="timer-chip">
          <span>Time left</span>
          <strong>{formatClock(timeLeftMs)}</strong>
        </div>
      </div>
      <div className="question-list">
        {questions.map((question) => (
          <article key={question.id} className="question-card">
            <header>
              <span className="q-number">Q{question.sequence}</span>
              <ReactMarkdown className="question-prompt">{question.prompt}</ReactMarkdown>
            </header>
            <div className="options">
              {['A', 'B', 'C', 'D'].map((optionKey) => (
                <label key={optionKey} className={`option ${answers[question.id] === optionKey ? 'option--selected' : ''}`}>
                  <input
                    type="radio"
                    name={`question-${question.id}`}
                    value={optionKey}
                    checked={answers[question.id] === optionKey}
                    onChange={() => onAnswer(question.id, optionKey)}
                  />
                  <span>{question[`option${optionKey}`]}</span>
                </label>
              ))}
            </div>
          </article>
        ))}
      </div>
      <button className="primary submit-btn" onClick={onSubmit} disabled={loading}>
        {loading ? 'Submitting...' : 'Submit exam'}
      </button>
    </section>
  );
}

function LockedState({ reason, onReset }) {
  return (
    <section className="card locked">
      <h2>Session closed</h2>
      <p>
        The system detected a security violation or timeout and permanently closed this attempt.
        Student IDs cannot be reused.
      </p>
      <p className="reason">{reason}</p>
      <button onClick={onReset}>Return to login</button>
    </section>
  );
}

function ResultCard({ onReset }) {
  return (
    <section className="card result">
      <h2>Submission received</h2>
      <p>
        Thank you for completing the assessment. Your responses were securely stored in
        the Data Conquest audit log and will be reviewed by the recruitment panel.
      </p>
      <p>Results will be communicated separately.</p>
      <button onClick={onReset}>Return to login</button>
    </section>
  );
}

function formatClock(ms) {
  if (typeof ms !== 'number' || Number.isNaN(ms)) {
    return '--:--';
  }
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export default App;
