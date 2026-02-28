const Recorder = {
  frames: [],
  isRecording: false,
  settings: {
    duration: 3,
    fps: 10,
    bgMode: 'transparent'
  },

  getBgColor() {
    switch (this.settings.bgMode) {
      case 'transparent': return { r: 0, g: 0, b: 0, a: 0 };
      case 'white':       return { r: 255, g: 255, b: 255, a: 255 };
      case 'black':       return { r: 0, g: 0, b: 0, a: 255 };
    }
  },

  getFgColor() {
    if (this.settings.bgMode === 'black') {
      return { r: 255, g: 255, b: 255, a: 255 };
    }
    return { r: 0, g: 0, b: 0, a: 255 };
  },

  async startCountdown(onTick) {
    for (let i = 3; i > 0; i--) {
      onTick(i);
      await new Promise(r => setTimeout(r, 1000));
    }
    onTick(0);
  },

  async startRecording(videoElement, processingCanvas, onProgress) {
    this.frames = [];
    this.isRecording = true;

    const totalFrames = this.settings.duration * this.settings.fps;
    const intervalMs = 1000 / this.settings.fps;
    let capturedCount = 0;

    const ctx = processingCanvas.getContext('2d');
    processingCanvas.width = videoElement.videoWidth;
    processingCanvas.height = videoElement.videoHeight;

    const fgColor = this.getFgColor();
    const bgColor = this.getBgColor();

    return new Promise((resolve) => {
      const captureFrame = async () => {
        if (capturedCount >= totalFrames || !this.isRecording) {
          this.isRecording = false;
          resolve(this.frames);
          return;
        }

        // 세그멘테이션 + 포즈 감지 병렬 실행
        const results = await Promise.all([
          Segmenter.segmentFrame(videoElement),
          PoseDetector.estimatePose(videoElement)
        ]);
        const people = results[0];
        const poseResult = results[1];

        const maskImageData = await Segmenter.createSilhouetteMask(
          people, fgColor, bgColor
        );

        ctx.clearRect(0, 0, processingCanvas.width, processingCanvas.height);
        ctx.putImageData(maskImageData, 0, 0);

        const blob = await new Promise(r =>
          processingCanvas.toBlob(r, 'image/png')
        );

        this.frames.push({
          blob: blob,
          imageData: new ImageData(
            new Uint8ClampedArray(maskImageData.data),
            maskImageData.width,
            maskImageData.height
          ),
          index: capturedCount,
          pose: PoseDetector.packagePose(
            poseResult, processingCanvas.width, processingCanvas.height
          )
        });

        capturedCount++;
        if (onProgress) {
          onProgress(capturedCount, totalFrames);
        }

        setTimeout(captureFrame, intervalMs);
      };

      captureFrame();
    });
  },

  stopRecording() {
    this.isRecording = false;
  }
};
