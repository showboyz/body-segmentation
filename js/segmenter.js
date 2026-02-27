const Segmenter = {
  model: null,

  // 보정 설정
  threshold: 0.65,   // 배경 노이즈 제거 (높을수록 엄격, 0.5~0.9)
  blurRadius: 4,     // 가장자리 스무딩 (높을수록 부드러움)
  erodeSize: 2,      // 외곽 침식 (노이즈 제거)

  async init() {
    var model = bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation;
    var config = {
      runtime: 'mediapipe',
      modelType: 'general',
      solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation'
    };
    this.model = await bodySegmentation.createSegmenter(model, config);

    // 보정용 오프스크린 캔버스
    this._smoothCanvas = document.createElement('canvas');
    this._smoothCtx = this._smoothCanvas.getContext('2d', { willReadFrequently: true });

    return this.model;
  },

  async segmentFrame(videoElement) {
    return await this.model.segmentPeople(videoElement, {
      flipHorizontal: false
    });
  },

  async createSilhouetteMask(people, fgColor, bgColor) {
    // 높은 threshold로 배경 노이즈 차단
    var rawMask = await bodySegmentation.toBinaryMask(
      people,
      fgColor,
      bgColor,
      false,
      this.threshold
    );

    // 후처리: 침식 → 블러로 가장자리 정리
    return this._postProcess(rawMask, fgColor, bgColor);
  },

  // 전경/배경 판별 (색상 모드 무관하게 동작)
  _isForeground: function(data, idx, fgColor) {
    return data[idx] === fgColor.r &&
           data[idx + 1] === fgColor.g &&
           data[idx + 2] === fgColor.b;
  },

  _postProcess: function(imageData, fgColor, bgColor) {
    var w = imageData.width;
    var h = imageData.height;
    var src = imageData.data;
    var self = this;

    // 1단계: 알파 마스크 생성 (흰=전경, 검=배경) - 색상 무관하게 처리
    var maskData = new Uint8ClampedArray(w * h * 4);
    for (var i = 0; i < src.length; i += 4) {
      var fg = self._isForeground(src, i, fgColor);
      var v = fg ? 255 : 0;
      maskData[i] = v;
      maskData[i + 1] = v;
      maskData[i + 2] = v;
      maskData[i + 3] = 255;
    }

    // 2단계: 침식 (Erode) - 노이즈 제거
    var eroded = new Uint8ClampedArray(maskData.length);
    var es = this.erodeSize;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var idx = (y * w + x) * 4;
        if (maskData[idx] === 0) {
          eroded[idx] = 0; eroded[idx+1] = 0; eroded[idx+2] = 0; eroded[idx+3] = 255;
          continue;
        }
        var allFg = true;
        for (var dy = -es; dy <= es && allFg; dy++) {
          for (var dx = -es; dx <= es && allFg; dx++) {
            var ny = y + dy, nx = x + dx;
            if (ny < 0 || ny >= h || nx < 0 || nx >= w) { allFg = false; continue; }
            if (maskData[(ny * w + nx) * 4] === 0) allFg = false;
          }
        }
        var val = allFg ? 255 : 0;
        eroded[idx] = val; eroded[idx+1] = val; eroded[idx+2] = val; eroded[idx+3] = 255;
      }
    }

    // 3단계: 블러로 가장자리 스무딩
    var canvas = this._smoothCanvas;
    var ctx = this._smoothCtx;
    canvas.width = w;
    canvas.height = h;

    ctx.putImageData(new ImageData(eroded, w, h), 0, 0);
    ctx.filter = 'blur(' + this.blurRadius + 'px)';
    ctx.drawImage(canvas, 0, 0);
    ctx.filter = 'none';

    // 4단계: 블러된 마스크 → 최종 색상 적용
    var blurred = ctx.getImageData(0, 0, w, h);
    var out = blurred.data;

    for (var j = 0; j < out.length; j += 4) {
      if (out[j] > 100) {
        out[j] = fgColor.r; out[j+1] = fgColor.g; out[j+2] = fgColor.b; out[j+3] = fgColor.a;
      } else {
        out[j] = bgColor.r; out[j+1] = bgColor.g; out[j+2] = bgColor.b; out[j+3] = bgColor.a;
      }
    }

    return new ImageData(out, w, h);
  },

  drawLivePreview(canvas, videoElement, maskImageData) {
    bodySegmentation.drawMask(
      canvas,
      videoElement,
      maskImageData,
      0.7,
      5
    );
  }
};
