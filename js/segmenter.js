const Segmenter = {
  model: null,

  // 보정 설정 (게임용 매끈한 실루엣)
  threshold: 0.60,
  erodeSize: 1,      // 가볍게 침식 (노이즈만 제거)
  dilateSize: 3,     // 팽창으로 빈틈 채우기
  blurPasses: 3,     // 다중 블러 패스 (매끈한 곡선)
  blurRadius: 6,     // 블러 반경
  smoothCut: 128,    // 최종 이진화 기준값

  async init() {
    var model = bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation;
    var config = {
      runtime: 'mediapipe',
      modelType: 'general',
      solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation'
    };
    this.model = await bodySegmentation.createSegmenter(model, config);

    this._smoothCanvas = document.createElement('canvas');
    this._smoothCtx = this._smoothCanvas.getContext('2d', { willReadFrequently: true });
    this._tempCanvas = document.createElement('canvas');
    this._tempCtx = this._tempCanvas.getContext('2d', { willReadFrequently: true });

    return this.model;
  },

  async segmentFrame(videoElement) {
    return await this.model.segmentPeople(videoElement, {
      flipHorizontal: false
    });
  },

  async createSilhouetteMask(people, fgColor, bgColor) {
    var rawMask = await bodySegmentation.toBinaryMask(
      people, fgColor, bgColor, false, this.threshold
    );
    return this._postProcess(rawMask, fgColor, bgColor);
  },

  _isForeground: function(data, idx, fgColor) {
    return data[idx] === fgColor.r &&
           data[idx + 1] === fgColor.g &&
           data[idx + 2] === fgColor.b;
  },

  // 모폴로지 연산 (침식/팽창)
  _morphology: function(input, w, h, radius, mode) {
    var output = new Uint8ClampedArray(input.length);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var idx = (y * w + x) * 4;

        if (mode === 'erode') {
          // 주변 모두 흰색이어야 흰색 유지
          var allWhite = true;
          for (var dy = -radius; dy <= radius && allWhite; dy++) {
            for (var dx = -radius; dx <= radius && allWhite; dx++) {
              if (dx*dx + dy*dy > radius*radius) continue; // 원형 커널
              var ny = y + dy, nx = x + dx;
              if (ny < 0 || ny >= h || nx < 0 || nx >= w) { allWhite = false; continue; }
              if (input[(ny * w + nx) * 4] === 0) allWhite = false;
            }
          }
          var v = allWhite ? 255 : 0;
        } else {
          // 주변 하나라도 흰색이면 흰색
          var anyWhite = false;
          for (var dy = -radius; dy <= radius && !anyWhite; dy++) {
            for (var dx = -radius; dx <= radius && !anyWhite; dx++) {
              if (dx*dx + dy*dy > radius*radius) continue;
              var ny = y + dy, nx = x + dx;
              if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
              if (input[(ny * w + nx) * 4] === 255) anyWhite = true;
            }
          }
          var v = anyWhite ? 255 : 0;
        }

        output[idx] = v;
        output[idx + 1] = v;
        output[idx + 2] = v;
        output[idx + 3] = 255;
      }
    }
    return output;
  },

  _postProcess: function(imageData, fgColor, bgColor) {
    var w = imageData.width;
    var h = imageData.height;
    var src = imageData.data;
    var self = this;

    // 1단계: 흑백 마스크 변환
    var mask = new Uint8ClampedArray(w * h * 4);
    for (var i = 0; i < src.length; i += 4) {
      var v = self._isForeground(src, i, fgColor) ? 255 : 0;
      mask[i] = v; mask[i+1] = v; mask[i+2] = v; mask[i+3] = 255;
    }

    // 2단계: 침식 (작은 노이즈 제거)
    var eroded = this._morphology(mask, w, h, this.erodeSize, 'erode');

    // 3단계: 팽창 (빈틈 메우기 + 형태 복원)
    var dilated = this._morphology(eroded, w, h, this.dilateSize, 'dilate');

    // 4단계: 클로징 (팽창→침식, 내부 구멍 메우기)
    var closed = this._morphology(dilated, w, h, 2, 'erode');

    // 5단계: 다중 블러 패스 (매끈한 곡선)
    var canvas = this._smoothCanvas;
    var ctx = this._smoothCtx;
    canvas.width = w;
    canvas.height = h;

    ctx.putImageData(new ImageData(closed, w, h), 0, 0);

    for (var p = 0; p < this.blurPasses; p++) {
      ctx.filter = 'blur(' + this.blurRadius + 'px)';
      ctx.drawImage(canvas, 0, 0);
      ctx.filter = 'none';

      // 중간 패스에서 부드럽게 재이진화 (곡선 유지)
      if (p < this.blurPasses - 1) {
        var mid = ctx.getImageData(0, 0, w, h);
        var md = mid.data;
        for (var j = 0; j < md.length; j += 4) {
          var val = md[j] > this.smoothCut ? 255 : 0;
          md[j] = val; md[j+1] = val; md[j+2] = val; md[j+3] = 255;
        }
        ctx.putImageData(mid, 0, 0);
      }
    }

    // 6단계: 최종 블러된 마스크 → 색상 적용
    var final = ctx.getImageData(0, 0, w, h);
    var out = final.data;

    for (var k = 0; k < out.length; k += 4) {
      if (out[k] > this.smoothCut) {
        out[k] = fgColor.r; out[k+1] = fgColor.g; out[k+2] = fgColor.b; out[k+3] = fgColor.a;
      } else {
        out[k] = bgColor.r; out[k+1] = bgColor.g; out[k+2] = bgColor.b; out[k+3] = bgColor.a;
      }
    }

    return new ImageData(out, w, h);
  },

  drawLivePreview(canvas, videoElement, maskImageData) {
    bodySegmentation.drawMask(
      canvas, videoElement, maskImageData, 0.7, 5
    );
  }
};
