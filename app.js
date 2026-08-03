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
  poseReady: false,
  repPhase: "up",
  lastCueAt: 0,
  lastAlertAt: 0,
  lastFormErrorAt: 0,
  formScore: null,
};

const els = {
  video: document.querySelector("#video"),
  canvas: document.querySelector("#overlay"),
  placeholder: document.querySelector("#cameraPlaceholder"),
  modelStatus: document.querySelector("#modelStatus"),
  startCamera: document.querySelector("#startCamera"),
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
let demoTick = 0;

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

function analysePose(landmarks) {
  if (!landmarks || landmarks.length < 29) {
    return { message: "Move fully into frame.", tone: "warn" };
  }

  const exercise = exercises[state.currentExercise];
  const side = chooseSide(landmarks);
  const kneeAngle = angle(side.hip, side.knee, side.ankle);
  const drift = kneeDrift(side);
  const inFrame =
    [side.hip, side.knee, side.ankle].every((point) => (point.visibility || 0) > 0.45) &&
    side.hip.y > 0 &&
    side.ankle.y < 1;

  if (!inFrame) {
    state.formScore = 40;
    return { message: "Step back until hip, knee, and ankle are visible.", tone: "warn" };
  }

  if (!exercise.legRaise && drift > 0.085 && kneeAngle < 150) {
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

  const completedRep = updateRepCount(kneeAngle, side, exercise);
  if (completedRep) {
    state.points += 10;
    state.formScore = Math.min(100, 86 + Math.max(0, state.reps - state.errors));
    return { message: "Good rep. Smooth and controlled.", tone: "good" };
  }

  state.formScore = Math.max(72, 95 - state.errors * 5);
  return {
    message: `${exercise.name}: knee angle ${kneeAngle} degrees.`,
    tone: state.repPhase === "down" ? "good" : "",
  };
}

function updateRepCount(kneeAngle, side, exercise) {
  if (exercise.legRaise) {
    const ankleLifted = side.ankle.y < side.hip.y + 0.12 && kneeAngle > exercise.up;
    const lowered = side.ankle.y > side.hip.y + 0.26;
    if (lowered) state.repPhase = "down";
    if (state.repPhase === "down" && ankleLifted) {
      state.repPhase = "up";
      incrementRep();
      return true;
    }
    return false;
  }

  if (kneeAngle < exercise.down) state.repPhase = "down";
  if (state.repPhase === "down" && kneeAngle > exercise.up) {
    state.repPhase = "up";
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
    ctx.moveTo(landmarks[a].x * width, landmarks[a].y * height);
    ctx.lineTo(landmarks[b].x * width, landmarks[b].y * height);
    ctx.stroke();
  });

  ctx.fillStyle = "#ffffff";
  [23, 24, 25, 26, 27, 28].forEach((index) => {
    const point = landmarks[index];
    if (!point) return;
    ctx.beginPath();
    ctx.arc(point.x * width, point.y * height, 7, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawVideoFrame() {
  ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
  if (els.video.readyState >= 2) {
    ctx.save();
    ctx.translate(els.canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(els.video, 0, 0, els.canvas.width, els.canvas.height);
    ctx.restore();
  } else {
    ctx.fillStyle = "#141a21";
    ctx.fillRect(0, 0, els.canvas.width, els.canvas.height);
  }
}

async function initPose() {
  if (poseLandmarker) return;
  els.modelStatus.textContent = "Loading AI";
  const vision = await import(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/+esm"
  );
  const fileset = await vision.FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm",
  );
  poseLandmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numPoses: 1,
  });
  state.poseReady = true;
}

async function startCamera() {
  try {
    await initPose();
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 960 },
      },
      audio: false,
    });
    els.video.srcObject = stream;
    await els.video.play();
    state.cameraRunning = true;
    state.demoMode = false;
    els.placeholder.style.display = "none";
    els.modelStatus.textContent = "Tracking";
    setFeedback("Camera ready. Start slowly.", "good");
    speak("Camera ready. Start slowly.");
    loop();
  } catch (error) {
    state.demoMode = true;
    els.placeholder.style.display = "none";
    els.modelStatus.textContent = "Demo mode";
    setFeedback("Camera unavailable. Running demo tracking.", "warn");
    loop();
  }
}

function syntheticLandmarks() {
  demoTick += 0.065;
  const bend = (Math.sin(demoTick) + 1) / 2;
  const kneeY = 0.58 + bend * 0.1;
  const ankleY = 0.82;
  const drift = Math.sin(demoTick * 0.45) > 0.72 ? 0.09 : 0.025;
  const points = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.9,
  }));
  points[11] = { x: 0.42, y: 0.25, visibility: 0.9 };
  points[12] = { x: 0.58, y: 0.25, visibility: 0.9 };
  points[23] = { x: 0.44, y: 0.46, visibility: 0.9 };
  points[24] = { x: 0.56, y: 0.46, visibility: 0.9 };
  points[25] = { x: 0.44 + drift, y: kneeY, visibility: 0.9 };
  points[26] = { x: 0.56 - drift, y: kneeY, visibility: 0.9 };
  points[27] = { x: 0.43, y: ankleY, visibility: 0.9 };
  points[28] = { x: 0.57, y: ankleY, visibility: 0.9 };
  return points;
}

function loop() {
  drawVideoFrame();
  let landmarks;

  if (state.demoMode) {
    landmarks = syntheticLandmarks();
  } else if (poseLandmarker && els.video.readyState >= 2) {
    const result = poseLandmarker.detectForVideo(els.video, performance.now());
    landmarks = result.landmarks?.[0];
  }

  if (landmarks) {
    drawPose(landmarks);
    const result = analysePose(landmarks);
    setFeedback(result.message, result.tone);
    if (result.tone === "warn") speak(result.message);
  }

  render();
  animationFrame = requestAnimationFrame(loop);
}

function nextExercise() {
  state.currentExercise = (state.currentExercise + 1) % exercises.length;
  state.reps = 0;
  state.repPhase = "up";
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
  state.repPhase = "up";
  setFeedback(exercises[state.currentExercise].cue);
  render();
});

els.startCamera.addEventListener("click", startCamera);
els.demoMode.addEventListener("click", () => {
  state.demoMode = true;
  state.cameraRunning = false;
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
