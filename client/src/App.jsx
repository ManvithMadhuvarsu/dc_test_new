import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import './App.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
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

  // Count only actual questions (exclude headers) for display
  const actualQuestionCount = useMemo(() => 
    questions.filter(q => !q.is_group_header).length, 
    [questions]
  );

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

    let hasAutoSubmitted = false;

    const evaluate = async () => {
      const diff = new Date(session.expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeftMs(0);

        // Auto-submit current answers when time elapses
        if (!hasAutoSubmitted) {
          hasAutoSubmitted = true;
          try {
            await submitExam();
          } catch (error) {
            // If auto-submit fails, lock the session to prevent further actions
            console.error('Auto-submit on time elapsed failed:', error);
        reportViolation('Exam time elapsed');
          }
        }
        return null;
      }
      setTimeLeftMs(diff);
      return diff;
    };

    // Initial evaluation
    evaluate();
    const interval = setInterval(() => {
      evaluate().then((result) => {
        if (result === null) {
        clearInterval(interval);
      }
      });
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

  const updateAnswer = (questionId, option, allowsMultiple) => {
    setAnswers((prev) => {
      if (allowsMultiple) {
        // Multi-select: toggle option in array
        const current = prev[questionId];
        const currentArray = Array.isArray(current) ? current : (current ? [current] : []);
        const newArray = currentArray.includes(option)
          ? currentArray.filter(opt => opt !== option) // Remove if already selected
          : [...currentArray, option].sort(); // Add and sort
        return {
          ...prev,
          [questionId]: newArray.length > 0 ? newArray : null,
        };
      } else {
        // Single-select: replace with single option
        return {
      ...prev,
      [questionId]: option,
        };
      }
    });
  };

  const submitExam = async () => {
    setLoading(true);
    setFeedback('');
    try {
      // Filter out header questions - they shouldn't have answers
      const questionIdSet = new Set(questions.filter(q => !q.is_group_header).map(q => q.id));
      
      const formattedAnswers = Object.entries(answers)
        .filter(([questionId]) => questionIdSet.has(Number(questionId)))
        .map(([questionId, selectedOption]) => ({
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
    setFeedback(''); // Clear any error messages when resetting
  };

  // Clear feedback when phase changes (so errors don't persist across pages)
  useEffect(() => {
    // Clear feedback when leaving IN_PROGRESS phase or when on non-error phases
    if (phase === 'LOGIN' || phase === 'SUBMITTED' || phase === 'LOCKED' || phase === 'INSTRUCTIONS') {
      setFeedback('');
    }
  }, [phase]);

  return (
    <div className="app-shell">
      <main className={`surface ${phase === 'IN_PROGRESS' ? 'exam-board-container' : ''}`}>
        {phase !== 'IN_PROGRESS' && (
          <>
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
          </>
        )}

        {/* Only show feedback on specific phases where it's relevant */}
        {feedback && (phase === 'LOGIN' || phase === 'IN_PROGRESS') && (
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
            questionCount={actualQuestionCount}
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
            totalQuestions={actualQuestionCount}
            session={session}
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
  totalQuestions,
  session,
}) {
  const [currentQuestionId, setCurrentQuestionId] = useState(null);
  const [viewedQuestions, setViewedQuestions] = useState(new Set());

  // Track viewed questions when scrolling
  useEffect(() => {
    const handleScroll = () => {
      const questionCards = document.querySelectorAll('.question-card');
      questionCards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        if (rect.top >= 0 && rect.top < window.innerHeight / 2) {
          const questionId = card.getAttribute('data-question-id');
          if (questionId) {
            setViewedQuestions(prev => new Set([...prev, questionId]));
          }
        }
      });
    };

    const container = document.querySelector('.question-list');
    if (container) {
      container.addEventListener('scroll', handleScroll);
      handleScroll(); // Initial check
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [questions]);

  // Scroll to question when clicking number
  const scrollToQuestion = (questionId) => {
    const element = document.querySelector(`[data-question-id="${questionId}"]`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setCurrentQuestionId(questionId);
      setViewedQuestions(prev => new Set([...prev, String(questionId)]));
    }
  };
  
  // Group questions by question_group_id while maintaining sequence order
  // Questions come from backend already sorted by sequence, so we preserve that order
  // Then assign sequential display numbers (Q1, Q2, Q3...) based on final display order
  const groupedQuestions = useMemo(() => {
    const groups = new Map();
    const ungrouped = [];
    const groupOrderMap = new Map(); // Track order of groups as they appear

    // Process questions in the order they come from backend (preserves zigzag for individuals)
    questions.forEach((q, index) => {
      if (q.question_group_id && q.question_group_id !== null) {
        if (!groups.has(q.question_group_id)) {
          groups.set(q.question_group_id, []);
          // Track the first appearance of this group to maintain order
          groupOrderMap.set(q.question_group_id, groupOrderMap.size);
        }
        groups.get(q.question_group_id).push(q);
      } else {
        ungrouped.push(q);
      }
    });

    // Sort groups by their first appearance order, then sort questions within group
    // Group questions maintain their order (header first, then by group_order/sequence)
    const sortedGroups = Array.from(groups.entries())
      .sort(([groupIdA], [groupIdB]) => groupOrderMap.get(groupIdA) - groupOrderMap.get(groupIdB))
      .map(([groupId, groupQs]) => {
        // Sort questions within group: header first, then by group_order or sequence
        const sorted = groupQs.sort((a, b) => {
          if (a.is_group_header) return -1;
          if (b.is_group_header) return 1;
          // Use group_order if available, otherwise sequence
          const orderA = a.group_order !== null && a.group_order !== undefined ? a.group_order : a.sequence;
          const orderB = b.group_order !== null && b.group_order !== undefined ? b.group_order : b.sequence;
          if (orderA === null || orderA === undefined) return 1;
          if (orderB === null || orderB === undefined) return -1;
          return orderA - orderB;
        });
        const header = sorted.find(q => q.is_group_header);
        const rest = sorted.filter(q => !q.is_group_header);
        return { groupId, header, questions: rest };
      });

    // Ungrouped questions maintain their zigzag order (don't sort by sequence)
    // They come from backend in shuffled order, we just preserve that
    
    // Now assign sequential display numbers (Q1, Q2, Q3...) based on final display order
    // This ensures question numbers are always sequential regardless of zigzag/group order
    let displaySequence = 1;
    
    // Assign numbers to group questions first
    const groupsWithNumbers = sortedGroups.map(({ groupId, header, questions: groupQs }) => {
      const questionsWithNumbers = groupQs.map(q => ({
        ...q,
        displaySequence: displaySequence++ // Sequential numbers based on display order
      }));
      return { groupId, header, questions: questionsWithNumbers };
    });
    
    // Then assign numbers to ungrouped questions
    const ungroupedWithNumbers = ungrouped.map(q => ({
      ...q,
      displaySequence: displaySequence++ // Sequential numbers based on display order
    }));
    
    return { groups: groupsWithNumbers, ungrouped: ungroupedWithNumbers };
  }, [questions]);

  // Get all actual questions with displaySequence for sidebar grid
  const questionsForGrid = useMemo(() => {
    const allQuestions = [];
    groupedQuestions.groups.forEach(({ questions: groupQs }) => {
      allQuestions.push(...groupQs);
    });
    allQuestions.push(...groupedQuestions.ungrouped);
    // Sort by displaySequence to ensure sequential order
    return allQuestions.sort((a, b) => (a.displaySequence || 0) - (b.displaySequence || 0));
  }, [groupedQuestions]);

  return (
    <section className="exam-board">
      {/* Left Sidebar */}
      <div className="exam-sidebar">
        <div className="sidebar-header">
          <h3>Exam Details</h3>
          {session && (
            <div className="sidebar-student-info">
              <div className="info-row">
                <span className="info-label">Candidate</span>
                <span className="info-value">{session.studentName || 'N/A'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">College ID</span>
                <span className="info-value">{session.studentId || 'N/A'}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Program</span>
                <span className="info-value">
                  {session.course || 'N/A'}
                  {session.degree ? ` • ${session.degree}` : ''}
                </span>
              </div>
            </div>
          )}
          <div className="sidebar-timer">
            <div className="timer-label">Time Left</div>
            <div className="timer-value">{formatClock(timeLeftMs)}</div>
          </div>
        </div>
        <div className="sidebar-questions">
          <h4>Questions</h4>
          <div className="question-grid">
            {questionsForGrid.map((q) => {
              const questionId = String(q.id);
              const isAttempted = answers[questionId] !== undefined && answers[questionId] !== null;
              const isViewed = viewedQuestions.has(questionId);
              const isCurrent = currentQuestionId === questionId;
              const displayNum = q.displaySequence || q.sequence || q.id;
              
              return (
                <button
                  key={q.id}
                  className={`question-number-btn ${
                    isCurrent ? 'current' : 
                    isAttempted ? 'attempted' : 
                    isViewed ? 'viewed' : ''
                  }`}
                  onClick={() => scrollToQuestion(q.id)}
                  title={`Question ${displayNum}`}
                >
                  {displayNum}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="exam-content">
        <div className="exam-content-header">
          <p>Answer carefully. Monitoring is active.</p>
          <span className="answered-count">{answeredCount} / {totalQuestions} answered</span>
      </div>
      <div className="question-list">
        {/* Render grouped questions */}
        {groupedQuestions.groups.map(({ groupId, header, questions: groupQs }) => (
          <div key={groupId} className="question-group">
            {/* Group header with instruction and image */}
            {header && (
              <div className="question-group-header">
                {header.image_url && (
                  <div className="question-image-container group-image">
                    <img 
                      src={header.image_url} 
                      alt="Question diagram or illustration"
                      className="question-image"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        console.warn('Failed to load question image:', header.image_url);
                      }}
                    />
                  </div>
                )}
                {header.prompt && (
                  <div className="question-prompt group-instruction">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeRaw]}
                      skipHtml={false}
                      components={{
                        code: ({node, inline, className, children, ...props}) => {
                          const match = /language-(\w+)/.exec(className || '');
                          return !inline && match ? (
                            <pre className="code-block" {...props}>
                              <code className={className}>{children}</code>
                            </pre>
                          ) : (
                            <code className="inline-code" {...props}>{children}</code>
                          );
                        },
                        p: ({node, children, ...props}) => (
                          <p className="markdown-paragraph" {...props}>{children}</p>
                        ),
                      }}
                    >
                      {header.prompt.replace(/\r\n/g, '\n')}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            )}
            {/* Group questions */}
            {groupQs.map((question) => (
              <article key={question.id} className="question-card" data-question-id={question.id}>
                <header>
                  {question.displaySequence && <span className="q-number">Q{question.displaySequence}</span>}
                  <div className="question-prompt">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeRaw]}
                      skipHtml={false}
                      components={{
                        code: ({node, inline, className, children, ...props}) => {
                          const match = /language-(\w+)/.exec(className || '');
                          return !inline && match ? (
                            <pre className="code-block" {...props}>
                              <code className={className}>{children}</code>
                            </pre>
                          ) : (
                            <code className="inline-code" {...props}>{children}</code>
                          );
                        },
                        p: ({node, children, ...props}) => (
                          <p className="markdown-paragraph" {...props}>{children}</p>
                        ),
                      }}
                    >
                      {question.prompt.replace(/\r\n/g, '\n')}
                    </ReactMarkdown>
                  </div>
                </header>
                {!question.is_group_header && (
                  <div className="options">
                    {['A', 'B', 'C', 'D'].map((optionKey) => {
                      // Check allowsMultiple - backend returns boolean, but handle edge cases
                      const isMultiSelect = Boolean(question.allowsMultiple) || Boolean(question.allows_multiple);
                      const currentAnswer = answers[question.id];
                      const isSelected = isMultiSelect
                        ? Array.isArray(currentAnswer) && currentAnswer.includes(optionKey)
                        : currentAnswer === optionKey;
                      
                      return (
                        <label 
                          key={optionKey} 
                          className={`option ${isSelected ? 'option--selected' : ''}`}
                        >
                          <input
                            type={isMultiSelect ? 'checkbox' : 'radio'}
                            name={isMultiSelect ? `question-${question.id}-${optionKey}` : `question-${question.id}`}
                            value={optionKey}
                            checked={isSelected}
                            onChange={() => onAnswer(question.id, optionKey, isMultiSelect)}
                          />
                          <span dangerouslySetInnerHTML={{ __html: question[`option${optionKey}`] || '' }}></span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </article>
            ))}
          </div>
        ))}

        {/* Render ungrouped questions */}
        {groupedQuestions.ungrouped.map((question) => (
          <article key={question.id} className="question-card" data-question-id={question.id}>
            <header>
              {question.displaySequence && <span className="q-number">Q{question.displaySequence}</span>}
              <div className="question-prompt">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw]}
                  skipHtml={false}
                  components={{
                    code: ({node, inline, className, children, ...props}) => {
                      const match = /language-(\w+)/.exec(className || '');
                      return !inline && match ? (
                        <pre className="code-block" {...props}>
                          <code className={className}>{children}</code>
                        </pre>
                      ) : (
                        <code className="inline-code" {...props}>{children}</code>
                      );
                    },
                    p: ({node, children, ...props}) => (
                      <p className="markdown-paragraph" {...props}>{children}</p>
                    ),
                  }}
                >
                  {question.prompt.replace(/\r\n/g, '\n')}
                </ReactMarkdown>
              </div>
              {question.image_url && (
                <div className="question-image-container">
                  <img 
                    src={question.image_url} 
                    alt="Question diagram or illustration"
                    className="question-image"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      console.warn('Failed to load question image:', question.image_url);
                    }}
                  />
                </div>
              )}
            </header>
            <div className="options">
              {['A', 'B', 'C', 'D'].map((optionKey) => {
                // Check allowsMultiple - backend returns boolean, but handle edge cases
                const isMultiSelect = Boolean(question.allowsMultiple) || Boolean(question.allows_multiple);
                const currentAnswer = answers[question.id];
                const isSelected = isMultiSelect
                  ? Array.isArray(currentAnswer) && currentAnswer.includes(optionKey)
                  : currentAnswer === optionKey;
                
                return (
                  <label 
                    key={optionKey} 
                    className={`option ${isSelected ? 'option--selected' : ''}`}
                  >
                  <input
                      type={isMultiSelect ? 'checkbox' : 'radio'}
                      name={isMultiSelect ? `question-${question.id}-${optionKey}` : `question-${question.id}`}
                    value={optionKey}
                      checked={isSelected}
                      onChange={() => onAnswer(question.id, optionKey, isMultiSelect)}
                  />
                  <span dangerouslySetInnerHTML={{ __html: question[`option${optionKey}`] || '' }}></span>
                </label>
                );
              })}
            </div>
          </article>
        ))}
      </div>
        <div style={{ padding: '1rem 1.5rem', borderTop: '2px solid #dfe8f5', background: '#f5faff' }}>
          <button className="primary submit-btn" onClick={onSubmit} disabled={loading} style={{ width: '100%' }}>
        {loading ? 'Submitting...' : 'Submit exam'}
      </button>
        </div>
      </div>
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
