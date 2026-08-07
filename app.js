const exercises = [
  {
    name: "Sit-to-stand",
    cue: "Stand tall, then sit with control.",
    target: 8,
    down: 112,
    up: 158,
  },
  {
    name: "Chair squat",
    cue: "Keep the knee tracking over the toes.",
    target: 8,
    down: 105,
    up: 158,
  },
  {
    name: "Straight-leg raise",
    cue: "Keep the knee straight and lift slowly.",
    target: 8,
    down: 155,
    up: 162,
    legRaise: true,
  },
  {
    name: "Step-up",
    cue: "Push through the heel and control the knee.",
    target: 6,
    down: 112,
    up: 158,
  },
  {
    name: "Heel slide",
    cue: "Bend and straighten within your prescribed range.",
    target: 8,
    down: 100,
    up: 150,
  },
];

const state = {
  currentExercise: 0,
  reps: 0,
  points: 0,
  streak: 0,
  errors: 0,
  completedExercises: 0,
  alerts: [],
  pain: 2,
  cameraRunning: false,
  demoMode: false,
  mirrorVideo: true,
  poseReady: false,
  repPhase: "up",
  movementMin: 180,
  movementMax: 0,
  ankleMin: 1,
  ankleMax: 0,
  lastCueAt: 0,
  lastAlertAt: 0,
  lastFormErrorAt: 0,
  lastRepAt: 0,
  missedPoseFrames: 0,
  formScore: null,
};

const els = {
  video: document.querySelector("#video"),
  canvas: document.querySelector("#overlay"),
  placeholder: document.querySelector("#cameraPlaceholder"),
  modelStatus: document.querySelector("#modelStatus"),
  startCamera: document.querySelector("#startCamera"),
  stopCamera: document.querySelector("#stopCamera"),
  cameraMode: document.querySelector("#cameraMode"),
  demoMode: document.querySelector("#demoMode"),
  nextExercise: document.querySelector("#nextExercise"),
  feedbackBand: document.querySelector("#feedbackBand"),
  exerciseName: document.querySelector("#exerciseName"),
  repCount: document.querySelector("#repCount"),
  repTarget: document.querySelector("#repTarget"),
  formScore: document.querySelector("#formScore"),
  points: document.querySelector("#points"),
  exerciseList: document.querySelector("#exerciseList"),
  painScore: document.querySelector("#painScore"),
  painValue: document.querySelector("#painValue"),
  sharpPain: document.querySelector("#sharpPain"),
  completeSession: document.querySelector("#completeSession"),
  adherence: document.querySelector("#adherence"),
  errorCount: document.querySelector("#errorCount"),
  lastPain: document.querySelector("#lastPain"),
  streak: document.querySelector("#streak"),
  riskLevel: document.querySelector("#riskLevel"),
  alerts: document.querySelector("#alerts"),
  missedSession: document.querySelector("#missedSession"),
  clearAlerts: document.querySelector("#clearAlerts"),
  voiceToggle: document.querySelector("#voiceToggle"),
};

const ctx = els.canvas.getContext("2d");
let poseLandmarker;
let animationFrame;
let cameraStream;
let demoTick = 0;
const FORM_DRIFT_THRESHOLD = 0.15;
const MEDIAPIPE_VERSION = "0.10.21";

function render() {
  const exercise = exercises[state.currentExercise];
  els.exerciseName.textContent = exercise.name;
  els.repCount.textContent = state.reps;
  els.repTarget.textContent = exercise.target;
  els.points.textContent = state.points;
  els.formScore.textContent = state.formScore === null ? "--" : `${state.formScore}%`;
  els.painValue.textContent = state.pain;
  els.adherence.textContent = `${Math.round(
    (state.completedExercises / exercises.length) * 100,
  )}%`;
  els.errorCount.textContent = state.errors;
  els.lastPain.textContent = `${state.pain}/10`;
  els.streak.textContent = `${state.streak} day${state.streak === 1 ? "" : "s"}`;
  els.riskLevel.textContent = state.alerts.some((alert) => alert.level === "high")
    ? "Review now"
    : state.alerts.some((alert) => alert.level === "medium")
      ? "Monitor"
      : "Low risk";

  els.exerciseList.innerHTML = exercises
    .map(
      (item, index) => `
        <button class="exercise-card ${index === state.currentExercise ? "active" : ""}" data-exercise="${index}">
          <span class="exercise-number">${index + 1}</span>
          <span class="exercise-copy">
            <strong>${item.name}</strong>
            <span>${item.cue}</span>
          </span>
          <span class="exercise-target">${item.target} reps</span>
        </button>
      `,
    )
    .join("");

  els.alerts.innerHTML = state.alerts.length
    ? state.alerts
        .map(
          (alert) => `
          <article class="alert-card ${alert.level}">
            <strong>${alert.title}</strong>
            <span>${alert.detail}</span>
            <small>${alert.time}</small>
          </article>
        `,
        )
        .join("")
    : `<article class="alert-card"><strong>No active alerts</strong><span>Session data will appear here during the demo.</span></article>`;
}

function setFeedback(message, tone = "") {
  els.feedbackBand.className = `feedback-band ${tone}`;
  els.feedbackBand.textContent = message;
}

function speak(message) {
  if (!els.voiceToggle.checked || !("speechSynthesis" in window)) return;
  const now = Date.now();
  if (now - state.lastCueAt < 2600) return;
  state.lastCueAt = now;
  window.speechSynthesis.cancel();
  const cue = new SpeechSynthesisUtterance(message);
  cue.rate = 0.98;
  cue.pitch = 1;
  window.speechSynthesis.speak(cue);
}

function addAlert(level, title, detail) {
  const now = Date.now();
  if (title !== "Sharp pain reported" && now - state.lastAlertAt < 4500) return;
  state.lastAlertAt = now;
  const duplicateIndex = state.alerts.findIndex(
    (alert) => alert.level === level && alert.title === title && alert.detail === detail,
  );
  if (duplicateIndex !== -1) {
    const [duplicate] = state.alerts.splice(duplicateIndex, 1);
    duplicate.time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    state.alerts.unshift(duplicate);
    render();
    return;
  }
  state.alerts.unshift({
    level,
    title,
    detail,
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  });
  state.alerts = state.alerts.slice(0, 8);
  render();
}

function angle(a, b, c) {
  const ab = { x: a.x - b.x, y: a.y - b.y };
  const cb = { x: c.x - b.x, y: c.y - b.y };
  const dot = ab.x * cb.x + ab.y * cb.y;
  const magAB = Math.hypot(ab.x, ab.y);
  const magCB = Math.hypot(cb.x, cb.y);
  const cosine = Math.min(1, Math.max(-1, dot / (magAB * magCB || 1)));
  return Math.round((Math.acos(cosine) * 180) / Math.PI);
}

function chooseSide(landmarks) {
  const leftVisibility =
    (landmarks[23]?.visibility || 0) +
    (landmarks[25]?.visibility || 0) +
    (landmarks[27]?.visibility || 0);
  const rightVisibility =
    (landmarks[24]?.visibility || 0) +
    (landmarks[26]?.visibility || 0) +
    (landmarks[28]?.visibility || 0);
  return leftVisibility >= rightVisibility
    ? { hip: landmarks[23], knee: landmarks[25], ankle: landmarks[27] }
    : { hip: landmarks[24], knee: landmarks[26], ankle: landmarks[28] };
}

function kneeDrift(side) {
  const midX = (side.hip.x + side.ankle.x) / 2;
  return Math.abs(side.knee.x - midX);
}

function resetMovementWindow() {
  state.repPhase = "up";
  state.movementMin = 180;
  state.movementMax = 0;
  state.ankleMin = 1;
  state.ankleMax = 0;
  state.missedPoseFrames = 0;
}

function analysePose(landmarks) {
  if (!landmarks || landmarks.length < 29) {
    state.formScore = null;
    return { message: "Move fully into frame.", tone: "warn" };
  }

  const exercise = exercises[state.currentExercise];
  const side = chooseSide(landmarks);
  if (!side.hip || !side.knee || !side.ankle) {
    state.formScore = null;
    return { message: "Move hip, knee, and ankle into frame.", tone: "warn" };
  }

  const kneeAngle = angle(side.hip, side.knee, side.ankle);
  const drift = kneeDrift(side);
  state.movementMin = Math.min(state.movementMin, kneeAngle);
  state.movementMax = Math.max(state.movementMax, kneeAngle);
  state.ankleMin = Math.min(state.ankleMin, side.ankle.y);
  state.ankleMax = Math.max(state.ankleMax, side.ankle.y);
  const movementRange = Math.round(state.movementMax - state.movementMin);
  const inFrame =
    [side.hip, side.knee, side.ankle].every((point) => (point.visibility ?? 1) > 0.35) &&
    side.hip.y > 0 &&
    side.ankle.y < 1;

  if (!inFrame) {
    state.formScore = 40;
    return { message: "Step back until hip, knee, and ankle are visible.", tone: "warn" };
  }

  const completedRep = updateRepCount(kneeAngle, side, exercise);
  if (completedRep) {
    state.points += 10;
    state.formScore = Math.min(100, 86 + Math.max(0, state.reps - state.errors));
    return {
      message: `Good rep ${state.reps}. Range ${movementRange} degrees.`,
      tone: "good",
    };
  }

  if (!exercise.legRaise && drift > FORM_DRIFT_THRESHOLD && kneeAngle < 150) {
    const now = Date.now();
    if (now - state.lastFormErrorAt > 1400) {
      state.errors += 1;
      state.lastFormErrorAt = now;
    }
    state.formScore = Math.max(45, 90 - state.errors * 6);
    if (state.errors >= 3) {
      addAlert(
        "medium",
        "Repeated form correction",
        "Knee is drifting away from the hip-to-ankle line during loaded movement.",
      );
    }
    return { message: "Keep the knee tracking over the middle toes.", tone: "warn" };
  }

  state.formScore = Math.max(72, 95 - state.errors * 5);
  return {
    message: `${exercise.name}: knee angle ${kneeAngle} degrees. Range ${movementRange} degrees.`,
    tone: state.repPhase === "down" ? "good" : "",
  };
}

function updateRepCount(kneeAngle, side, exercise) {
  const now = Date.now();
  if (now - state.lastRepAt < 650) return false;

  if (exercise.legRaise) {
    const ankleTravel = state.ankleMax - state.ankleMin;
    const liftedEnough = ankleTravel > 0.08 && side.ankle.y < state.ankleMax - 0.055;
    const lowered = ankleTravel > 0.08 && side.ankle.y > state.ankleMin + 0.055;
    if (lowered) state.repPhase = "down";
    if (state.repPhase === "down" && liftedEnough && kneeAngle > exercise.down) {
      state.repPhase = "up";
      state.lastRepAt = now;
      incrementRep();
      return true;
    }
    return false;
  }

  const movementRange = state.movementMax - state.movementMin;
  const bendTrigger = Math.max(exercise.down, state.movementMax - 16);
  const extensionTrigger = Math.max(
    state.movementMin + 16,
    state.movementMax - 10,
  );

  if (movementRange >= 14 && kneeAngle <= bendTrigger) state.repPhase = "down";
  if (
    state.repPhase === "down" &&
    movementRange >= 20 &&
    kneeAngle >= extensionTrigger
  ) {
    state.repPhase = "up";
    state.lastRepAt = now;
    incrementRep();
    return true;
  }
  return false;
}

function incrementRep() {
  const exercise = exercises[state.currentExercise];
  state.reps += 1;
  if (state.reps >= exercise.target) {
    state.completedExercises = Math.max(state.completedExercises, state.currentExercise + 1);
    state.streak = Math.max(state.streak, 1);
    addAlert(
      "low",
      "Exercise completed",
      `${exercise.name} target reached with ${state.errors} tracked form correction(s).`,
    );
    nextExercise();
  }
}

function drawPose(landmarks) {
  const width = els.canvas.width;
  const height = els.canvas.height;
  const pointX = (point) => (state.mirrorVideo ? 1 - point.x : point.x) * width;
  const pointY = (point) => point.y * height;
  const connections = [
    [11, 12],
    [11, 23],
    [12, 24],
    [23, 24],
    [23, 25],
    [25, 27],
    [24, 26],
    [26, 28],
  ];

  ctx.lineWidth = 5;
  ctx.strokeStyle = "#2fd3bd";
  connections.forEach(([a, b]) => {
    if (!landmarks[a] || !landmarks[b]) return;
    ctx.beginPath();
    ctx.moveTo(pointX(landmarks[a]), pointY(landmarks[a]));
    ctx.lineTo(pointX(landmarks[b]), pointY(landmarks[b]));
    ctx.stroke();
  });

  ctx.fillStyle = "#ffffff";
  [23, 24, 25, 26, 27, 28].forEach((index) => {
    const point = landmarks[index];
    if (!point) return;
    ctx.beginPath();
    ctx.arc(pointX(point), pointY(point), 7, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawVideoFrame() {
  ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
  if (els.video.readyState >= 2) {
    if (state.mirrorVideo) {
      ctx.save();
      ctx.translate(els.canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(els.video, 0, 0, els.canvas.width, els.canvas.height);
    if (state.mirrorVideo) ctx.restore();
  } else {
    ctx.fillStyle = "#141a21";
    ctx.fillRect(0, 0, els.canvas.width, els.canvas.height);
  }
}

async function initPose() {
  if (poseLandmarker) return;
  els.modelStatus.textContent = "Loading AI";
  const vision = await import(
    `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/+esm`
  );
  const fileset = await vision.FilesetResolver.forVisionTasks(
    `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`,
  );
  const baseOptions = {
    modelAssetPath:
      "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
  };
  try {
    poseLandmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { ...baseOptions, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  } catch (error) {
    console.warn("GPU pose model unavailable; retrying with CPU.", error);
    poseLandmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { ...baseOptions, delegate: "CPU" },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  }
  state.poseReady = true;
}

function cameraConstraints() {
  const selectedMode = els.cameraMode.value;
  const video = {
    width: { ideal: 1280 },
    height: { ideal: 960 },
  };
  if (selectedMode !== "auto") {
    video.facingMode = { ideal: selectedMode };
  }
  return { video, audio: false };
}

async function requestCameraStream() {
  try {
    return await navigator.mediaDevices.getUserMedia(cameraConstraints());
  } catch (error) {
    if (els.cameraMode.value === "auto") throw error;
    return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
}

function stopCameraStream() {
  if (!cameraStream) return;
  cameraStream.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  els.video.srcObject = null;
}

function stopCamera() {
  cancelAnimationFrame(animationFrame);
  stopCameraStream();
  state.cameraRunning = false;
  state.demoMode = false;
  state.formScore = null;
  resetMovementWindow();
  els.placeholder.style.display = "grid";
  els.modelStatus.textContent = "Camera idle";
  setFeedback("Select start when you are in frame.");
  render();
}

async function startCamera() {
  try {
    cancelAnimationFrame(animationFrame);
    resetMovementWindow();
    els.startCamera.disabled = true;
    els.stopCamera.disabled = false;
    els.modelStatus.textContent = "Loading AI";
    setFeedback("Loading movement model.", "");
    if (!window.isSecureContext) {
      throw new Error("Camera access requires HTTPS or localhost.");
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser does not support camera access.");
    }
    await initPose();
    stopCameraStream();
    const stream = await requestCameraStream();
    cameraStream = stream;
    els.video.srcObject = stream;
    await els.video.play();
    state.mirrorVideo = els.cameraMode.value !== "environment";
    state.cameraRunning = true;
    state.demoMode = false;
    els.placeholder.style.display = "none";
    els.modelStatus.textContent = "Tracking";
    setFeedback("Camera ready. Start slowly.", "good");
    speak("Camera ready. Start slowly.");
    loop();
  } catch (error) {
    console.warn("Camera tracking unavailable; using demo mode.", error);
    stopCameraStream();
    state.demoMode = true;
    state.cameraRunning = false;
    state.mirrorVideo = true;
    els.placeholder.style.display = "none";
    els.modelStatus.textContent = "Demo mode";
    setFeedback("Camera unavailable. Running demo tracking.", "warn");
    loop();
  } finally {
    els.startCamera.disabled = false;
  }
}

function syntheticLandmarks() {
  demoTick += 0.065;
  const cycle = (Math.sin(demoTick) + 1) / 2;
  const targetAngle = 96 + cycle * 74;
  const radians = (targetAngle * Math.PI) / 180;
  const shinLength = 0.26;
  const knee = { x: 0.45, y: 0.58 };
  const ankle = {
    x: knee.x + Math.sin(radians) * shinLength,
    y: knee.y - Math.cos(radians) * shinLength,
  };
  const hip = { x: knee.x, y: knee.y - 0.24 };
  const drift = Math.sin(demoTick * 0.45) > 0.88 ? 0.07 : 0;
  const points = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.9,
  }));
  points[11] = { x: 0.42, y: 0.25, visibility: 0.9 };
  points[12] = { x: 0.58, y: 0.25, visibility: 0.9 };
  points[23] = { x: hip.x, y: hip.y, visibility: 0.9 };
  points[24] = { x: 0.56, y: 0.46, visibility: 0.9 };
  points[25] = { x: knee.x + drift, y: knee.y, visibility: 0.9 };
  points[26] = { x: 0.56 - drift, y: knee.y, visibility: 0.9 };
  points[27] = { x: ankle.x, y: ankle.y, visibility: 0.9 };
  points[28] = { x: 0.57, y: ankle.y, visibility: 0.9 };
  return points;
}

function loop() {
  drawVideoFrame();
  let landmarks;

  if (state.demoMode) {
    landmarks = syntheticLandmarks();
  } else if (poseLandmarker && els.video.readyState >= 2) {
    try {
      const result = poseLandmarker.detectForVideo(els.video, performance.now());
      landmarks = result.landmarks?.[0];
      els.modelStatus.textContent = "Tracking";
    } catch (error) {
      console.warn("Live pose detection failed; switching to demo mode.", error);
      stopCameraStream();
      state.demoMode = true;
      state.cameraRunning = false;
      state.mirrorVideo = true;
      els.modelStatus.textContent = "Demo mode";
      setFeedback("Live tracking failed on this device. Running demo tracking.", "warn");
      landmarks = syntheticLandmarks();
    }
  }

  if (landmarks) {
    state.missedPoseFrames = 0;
    drawPose(landmarks);
    const result = analysePose(landmarks);
    setFeedback(result.message, result.tone);
    if (result.tone === "warn") speak(result.message);
  } else if (state.cameraRunning) {
    state.missedPoseFrames += 1;
    if (state.missedPoseFrames > 45) {
      state.formScore = null;
      setFeedback("No body detected. Step back and keep hip, knee, and ankle visible.", "warn");
      els.modelStatus.textContent = "Searching";
    }
  }

  render();
  animationFrame = requestAnimationFrame(loop);
}

function nextExercise() {
  state.currentExercise = (state.currentExercise + 1) % exercises.length;
  state.reps = 0;
  resetMovementWindow();
  state.errors = 0;
  state.formScore = null;
  setFeedback(exercises[state.currentExercise].cue);
  speak(exercises[state.currentExercise].cue);
  render();
}

function completeSession() {
  state.completedExercises = exercises.length;
  state.streak = Math.max(state.streak, 1);
  state.points += 50;
  addAlert("low", "Session completed", "Home session completed without a high-risk flag.");
  setFeedback("Session complete. Data is ready for clinician review.", "good");
  speak("Session complete.");
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector(`#${tab.dataset.view}View`).classList.add("active");
  });
});

els.exerciseList.addEventListener("click", (event) => {
  const card = event.target.closest("[data-exercise]");
  if (!card) return;
  state.currentExercise = Number(card.dataset.exercise);
  state.reps = 0;
  resetMovementWindow();
  setFeedback(exercises[state.currentExercise].cue);
  render();
});

els.startCamera.addEventListener("click", startCamera);
els.stopCamera.addEventListener("click", stopCamera);
els.stopCamera.disabled = true;
els.cameraMode.addEventListener("change", () => {
  state.mirrorVideo = els.cameraMode.value !== "environment";
  if (state.cameraRunning) startCamera();
});
els.demoMode.addEventListener("click", () => {
  stopCameraStream();
  state.demoMode = true;
  state.cameraRunning = false;
  state.mirrorVideo = true;
  els.stopCamera.disabled = false;
  resetMovementWindow();
  els.placeholder.style.display = "none";
  els.modelStatus.textContent = "Demo mode";
  cancelAnimationFrame(animationFrame);
  loop();
});
els.nextExercise.addEventListener("click", nextExercise);
els.completeSession.addEventListener("click", completeSession);
els.painScore.addEventListener("input", (event) => {
  state.pain = Number(event.target.value);
  if (state.pain >= 7) {
    addAlert("high", "High pain score", `Patient reported pain of ${state.pain}/10.`);
    setFeedback("Pain is high. Pause and wait for clinician review.", "alert");
    speak("Pain is high. Pause and wait for clinician review.");
  }
  render();
});
els.sharpPain.addEventListener("click", () => {
  state.pain = Math.max(state.pain, 8);
  els.painScore.value = state.pain;
  addAlert(
    "high",
    "Sharp pain reported",
    "Patient selected sharp pain during the home exercise session.",
  );
  setFeedback("Stop the exercise. Clinician review has been flagged.", "alert");
  speak("Stop the exercise. Clinician review has been flagged.");
});
els.missedSession.addEventListener("click", () => {
  addAlert("medium", "Missed session", "Patient missed a scheduled knee rehab session.");
});
els.clearAlerts.addEventListener("click", () => {
  state.alerts = [];
  state.errors = 0;
  render();
});

render();
