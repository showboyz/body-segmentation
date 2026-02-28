var PoseDetector = {
  detector: null,
  showSkeleton: true,

  // BlazePose 스켈레톤 연결선
  SKELETON_CONNECTIONS: [
    [11, 12], // 어깨
    [11, 13], [13, 15], // 왼팔
    [12, 14], [14, 16], // 오른팔
    [15, 17], [15, 19], [15, 21], // 왼손
    [16, 18], [16, 20], [16, 22], // 오른손
    [11, 23], [12, 24], // 몸통
    [23, 24], // 엉덩이
    [23, 25], [25, 27], // 왼다리
    [24, 26], [26, 28], // 오른다리
    [27, 29], [29, 31], // 왼발
    [28, 30], [30, 32], // 오른발
  ],

  // 관절 각도 정의: [포인트A, 꼭짓점, 포인트B]
  ANGLE_DEFINITIONS: {
    leftElbow:     [11, 13, 15],
    rightElbow:    [12, 14, 16],
    leftShoulder:  [13, 11, 23],
    rightShoulder: [14, 12, 24],
    leftHip:       [11, 23, 25],
    rightHip:      [12, 24, 26],
    leftKnee:      [23, 25, 27],
    rightKnee:     [24, 26, 28],
  },

  async init() {
    var model = poseDetection.SupportedModels.BlazePose;
    var config = {
      runtime: 'mediapipe',
      modelType: 'lite',
      enableSmoothing: true,
      solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/pose'
    };
    this.detector = await poseDetection.createDetector(model, config);
    return this.detector;
  },

  async estimatePose(videoElement) {
    if (!this.detector) return null;
    try {
      var poses = await this.detector.estimatePoses(videoElement, {
        flipHorizontal: false
      });
      if (poses.length === 0) return null;
      return poses[0];
    } catch (e) {
      return null;
    }
  },

  normalizeKeypoints: function(keypoints, w, h) {
    return keypoints.map(function(kp) {
      return {
        name: kp.name,
        x: +(kp.x / w).toFixed(4),
        y: +(kp.y / h).toFixed(4),
        z: +(kp.z || 0).toFixed(4),
        score: +(kp.score || 0).toFixed(3)
      };
    });
  },

  computeAngles: function(normalizedKeypoints) {
    var angles = {};
    var defs = this.ANGLE_DEFINITIONS;

    for (var name in defs) {
      var indices = defs[name];
      var a = normalizedKeypoints[indices[0]];
      var b = normalizedKeypoints[indices[1]]; // 꼭짓점
      var c = normalizedKeypoints[indices[2]];

      if (!a || !b || !c || a.score < 0.5 || b.score < 0.5 || c.score < 0.5) {
        angles[name] = null;
        continue;
      }

      var ba = { x: a.x - b.x, y: a.y - b.y };
      var bc = { x: c.x - b.x, y: c.y - b.y };
      var dot = ba.x * bc.x + ba.y * bc.y;
      var magBA = Math.sqrt(ba.x * ba.x + ba.y * ba.y);
      var magBC = Math.sqrt(bc.x * bc.x + bc.y * bc.y);

      if (magBA === 0 || magBC === 0) {
        angles[name] = null;
        continue;
      }

      var cosAngle = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
      angles[name] = +(Math.acos(cosAngle) * (180 / Math.PI)).toFixed(1);
    }

    return angles;
  },

  drawSkeleton: function(ctx, keypoints, w, h) {
    if (!this.showSkeleton || !keypoints) return;
    var minScore = 0.5;

    // 연결선
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 2;
    this.SKELETON_CONNECTIONS.forEach(function(pair) {
      var a = keypoints[pair[0]];
      var b = keypoints[pair[1]];
      if (a && b && a.score > minScore && b.score > minScore) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    });

    // 관절 포인트
    keypoints.forEach(function(kp) {
      if (kp.score > minScore) {
        ctx.beginPath();
        ctx.arc(kp.x, kp.y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = '#ff4444';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });
  },

  // 포즈 데이터를 프레임용으로 패키징
  packagePose: function(poseResult, w, h) {
    if (!poseResult) return null;
    var normalized = this.normalizeKeypoints(poseResult.keypoints, w, h);
    return {
      keypoints: normalized,
      keypoints3D: poseResult.keypoints3D || null,
      angles: this.computeAngles(normalized)
    };
  }
};
