var PoseExporter = {

  exportPoseJson: function(frames, meta) {
    var poseData = {
      version: '1.0',
      model: 'BlazePose',
      keypointCount: 33,
      frameCount: frames.length,
      fps: meta.fps,
      frameWidth: meta.width,
      frameHeight: meta.height,
      timestamp: new Date().toISOString(),
      angleDefinitions: {
        leftElbow: 'shoulder-elbow-wrist',
        rightElbow: 'shoulder-elbow-wrist',
        leftShoulder: 'elbow-shoulder-hip',
        rightShoulder: 'elbow-shoulder-hip',
        leftHip: 'shoulder-hip-knee',
        rightHip: 'shoulder-hip-knee',
        leftKnee: 'hip-knee-ankle',
        rightKnee: 'hip-knee-ankle'
      },
      frames: frames.map(function(frame, i) {
        if (!frame.pose) {
          return { index: i, keypoints: null, angles: null };
        }
        return {
          index: i,
          keypoints: frame.pose.keypoints,
          keypoints3D: frame.pose.keypoints3D || null,
          angles: frame.pose.angles
        };
      })
    };

    var blob = new Blob(
      [JSON.stringify(poseData, null, 2)],
      { type: 'application/json' }
    );
    Exporter.downloadBlob(blob, 'pose-data_' + Exporter.timestamp() + '.json');
  },

  exportSnapshotPoseJson: function(poseResult, meta) {
    var poseData = {
      version: '1.0',
      model: 'BlazePose',
      keypointCount: 33,
      frameWidth: meta.width,
      frameHeight: meta.height,
      timestamp: new Date().toISOString(),
      keypoints: poseResult.keypoints,
      keypoints3D: poseResult.keypoints3D || null,
      angles: poseResult.angles
    };

    var blob = new Blob(
      [JSON.stringify(poseData, null, 2)],
      { type: 'application/json' }
    );
    Exporter.downloadBlob(blob, 'pose-snapshot_' + Exporter.timestamp() + '.json');
  }
};
