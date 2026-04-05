/**
 * Spine 3.3.x–3.7.x skeleton binary (inline strings, no 3.8 string table).
 * Version &lt; 3.5: spine-csharp 3.4 layout (inherit booleans on bones, no slot dark color, no constraint order).
 * Version 3.5–3.7: spine-csharp 3.5 layout (transformMode, dark slots, orders, transform local/relative).
 * Depends on spine-webgl.js: spine.*, SkeletonBinary.prototype.readAttachment / readCurve.
 */
(function (global) {
  "use strict";

  function LegacyBinaryInput(data) {
    this.strings = [];
    this.index = 0;
    this.buffer = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }
  LegacyBinaryInput.prototype.readByte = function () {
    return this.buffer.getInt8(this.index++);
  };
  /**
   * Multi-byte fields follow spine-ts 3.8 BinaryInput / spine-csharp 3.5 wire format: big-endian.
   * (Legacy had LE floats/ints → garbage UVs/verts; colors are 4-byte BE ints, not varints.)
   */
  LegacyBinaryInput.prototype.readShort = function () {
    var v = this.buffer.getInt16(this.index, false);
    this.index += 2;
    return v;
  };
  LegacyBinaryInput.prototype.readInt32 = function () {
    var v = this.buffer.getInt32(this.index, false);
    this.index += 4;
    return v;
  };
  LegacyBinaryInput.prototype.readInt = function (optimizePositive) {
    var b = this.readByte();
    var result = b & 0x7f;
    if ((b & 0x80) !== 0) {
      b = this.readByte();
      result |= (b & 0x7f) << 7;
      if ((b & 0x80) !== 0) {
        b = this.readByte();
        result |= (b & 0x7f) << 14;
        if ((b & 0x80) !== 0) {
          b = this.readByte();
          result |= (b & 0x7f) << 21;
          if ((b & 0x80) !== 0) {
            b = this.readByte();
            result |= (b & 0x7f) << 28;
          }
        }
      }
    }
    return optimizePositive ? result : ((result >>> 1) ^ -(result & 1));
  };
  LegacyBinaryInput.prototype.readString = function () {
    var byteCount = this.readInt(true);
    if (byteCount === 0) return null;
    if (byteCount === 1) return "";
    byteCount--;
    var chars = "";
    for (var i = 0; i < byteCount; ) {
      var b = this.readByte();
      switch (b >> 4) {
        case 12:
        case 13:
          chars += String.fromCharCode(((b & 0x1f) << 6) | (this.readByte() & 0x3f));
          i += 2;
          break;
        case 14:
          chars += String.fromCharCode(
            ((b & 0x0f) << 12) | ((this.readByte() & 0x3f) << 6) | (this.readByte() & 0x3f)
          );
          i += 3;
          break;
        default:
          chars += String.fromCharCode(b);
          i++;
      }
    }
    return chars;
  };
  /** Old .skel uses inline strings; 3.8 uses string table refs — treat as the same. */
  LegacyBinaryInput.prototype.readStringRef = function () {
    return this.readString();
  };
  LegacyBinaryInput.prototype.readFloat = function () {
    var v = this.buffer.getFloat32(this.index, false);
    this.index += 4;
    return v;
  };
  LegacyBinaryInput.prototype.readBoolean = function () {
    return this.readByte() !== 0;
  };

  /** Binary length 0 => null; Spine 3.8 JS rejects null for BoneData, SlotData, Skin, Animation, Attachment names. */
  function nonNullName(s) {
    return s == null ? "" : s;
  }

  function parseMajorMinor(versionStr) {
    if (!versionStr || typeof versionStr !== "string") return { major: 3, minor: 5 };
    var m = /^(\d+)\.(\d+)/.exec(versionStr.trim());
    if (!m) return { major: 3, minor: 5 };
    return { major: parseInt(m[1], 10), minor: parseInt(m[2], 10) };
  }

  /** Spine ≤3.4 binary: bones used inheritRotation/inheritScale booleans (spine-csharp 3.4.02). */
  function inheritToTransformMode(inheritRotation, inheritScale) {
    var TM = spine.TransformMode;
    if (inheritRotation) {
      return inheritScale ? TM.Normal : TM.NoScale;
    }
    return inheritScale ? TM.OnlyTranslation : TM.NoRotationOrReflection;
  }

  function readSByte(input) {
    return input.readByte();
  }

  function shouldUseLegacy(version) {
    if (!version || typeof version !== "string") return false;
    var m = /^(\d+)\.(\d+)/.exec(version.trim());
    if (!m) return false;
    var major = parseInt(m[1], 10);
    var minor = parseInt(m[2], 10);
    if (major < 3) return true;
    if (major === 3 && minor < 8) return true;
    return false;
  }

  function readSkin335(bin, input, skeletonData, skinName, nonessential) {
    var SB = spine.SkeletonBinary.prototype;
    var slotCount = input.readInt(true);
    if (slotCount === 0) return null;
    var skin = new spine.Skin(skinName);
    for (var i = 0; i < slotCount; i++) {
      var slotIndex = input.readInt(true);
      for (var ii = 0, nn = input.readInt(true); ii < nn; ii++) {
        var attName = nonNullName(input.readString());
        var att = SB.readAttachment.call(bin, input, skeletonData, skin, slotIndex, attName, nonessential);
        if (att != null) skin.setAttachment(slotIndex, attName, att);
      }
    }
    return skin;
  }

  function readSkeletonData335(atlasLoader, bytes) {
    var bin = new spine.SkeletonBinary(atlasLoader);
    var input = new LegacyBinaryInput(bytes);
    var scale = bin.scale;
    var skeletonData = new spine.SkeletonData();
    skeletonData.name = "";
    skeletonData.hash = input.readString();
    skeletonData.version = input.readString();
    skeletonData.x = 0;
    skeletonData.y = 0;
    skeletonData.width = input.readFloat();
    skeletonData.height = input.readFloat();
    var nonessential = input.readBoolean();
    var ver = parseMajorMinor(skeletonData.version);
    var pre35 = ver.major < 3 || (ver.major === 3 && ver.minor < 5);
    if (nonessential) {
      if (pre35) {
        skeletonData.imagesPath = input.readString();
      } else {
        skeletonData.fps = input.readFloat();
        skeletonData.imagesPath = input.readString();
      }
    }

    var TM = spine.SkeletonBinary.TransformModeValues;
    var BM = spine.SkeletonBinary.BlendModeValues;
    var PM = spine.SkeletonBinary.PositionModeValues;
    var SM = spine.SkeletonBinary.SpacingModeValues;
    var RM = spine.SkeletonBinary.RotateModeValues;

    var n;
    var ii;
    n = input.readInt(true);
    var i;
    for (i = 0; i < n; i++) {
      var boneName = nonNullName(input.readString());
      var parent = i === 0 ? null : skeletonData.bones[input.readInt(true)];
      var bone = new spine.BoneData(i, boneName, parent);
      bone.rotation = input.readFloat();
      bone.x = input.readFloat() * scale;
      bone.y = input.readFloat() * scale;
      bone.scaleX = input.readFloat();
      bone.scaleY = input.readFloat();
      bone.shearX = input.readFloat();
      bone.shearY = input.readFloat();
      bone.length = input.readFloat() * scale;
      if (pre35) {
        bone.transformMode = inheritToTransformMode(input.readBoolean(), input.readBoolean());
      } else {
        bone.transformMode = TM[input.readInt(true)];
      }
      bone.skinRequired = false;
      if (nonessential) input.readInt32();
      skeletonData.bones.push(bone);
    }

    n = input.readInt(true);
    for (i = 0; i < n; i++) {
      var slotName = nonNullName(input.readString());
      var boneData = skeletonData.bones[input.readInt(true)];
      var slot = new spine.SlotData(i, slotName, boneData);
      spine.Color.rgba8888ToColor(slot.color, input.readInt32());
      if (!pre35) {
        var dark = input.readInt32();
        if (dark !== -1) spine.Color.rgb888ToColor((slot.darkColor = new spine.Color()), dark);
      }
      slot.attachmentName = input.readString();
      slot.blendMode = BM[input.readInt(true)];
      skeletonData.slots.push(slot);
    }

    n = input.readInt(true);
    for (i = 0; i < n; i++) {
      var ik = new spine.IkConstraintData(nonNullName(input.readString()));
      ik.order = pre35 ? i : input.readInt(true);
      ik.skinRequired = false;
      var nn;
      for (nn = input.readInt(true), ii = 0; ii < nn; ii++)
        ik.bones.push(skeletonData.bones[input.readInt(true)]);
      ik.target = skeletonData.bones[input.readInt(true)];
      ik.mix = input.readFloat();
      ik.bendDirection = readSByte(input);
      ik.softness = 0;
      ik.compress = false;
      ik.stretch = false;
      ik.uniform = false;
      skeletonData.ikConstraints.push(ik);
    }

    n = input.readInt(true);
    for (i = 0; i < n; i++) {
      var tc = new spine.TransformConstraintData(nonNullName(input.readString()));
      tc.order = pre35 ? i : input.readInt(true);
      tc.skinRequired = false;
      for (nn = input.readInt(true), ii = 0; ii < nn; ii++) tc.bones.push(skeletonData.bones[input.readInt(true)]);
      tc.target = skeletonData.bones[input.readInt(true)];
      if (pre35) {
        tc.local = false;
        tc.relative = false;
      } else {
        tc.local = input.readBoolean();
        tc.relative = input.readBoolean();
      }
      tc.offsetRotation = input.readFloat();
      tc.offsetX = input.readFloat() * scale;
      tc.offsetY = input.readFloat() * scale;
      tc.offsetScaleX = input.readFloat();
      tc.offsetScaleY = input.readFloat();
      tc.offsetShearY = input.readFloat();
      tc.rotateMix = input.readFloat();
      tc.translateMix = input.readFloat();
      tc.scaleMix = input.readFloat();
      tc.shearMix = input.readFloat();
      skeletonData.transformConstraints.push(tc);
    }

    n = input.readInt(true);
    for (i = 0; i < n; i++) {
      var pc = new spine.PathConstraintData(nonNullName(input.readString()));
      pc.order = pre35 ? i : input.readInt(true);
      pc.skinRequired = false;
      for (nn = input.readInt(true), ii = 0; ii < nn; ii++) pc.bones.push(skeletonData.bones[input.readInt(true)]);
      pc.target = skeletonData.slots[input.readInt(true)];
      pc.positionMode = PM[input.readInt(true)];
      pc.spacingMode = SM[input.readInt(true)];
      pc.rotateMode = RM[input.readInt(true)];
      pc.offsetRotation = input.readFloat();
      pc.position = input.readFloat();
      if (pc.positionMode === spine.PositionMode.Fixed) pc.position *= scale;
      pc.spacing = input.readFloat();
      if (pc.spacingMode === spine.SpacingMode.Length || pc.spacingMode === spine.SpacingMode.Fixed) pc.spacing *= scale;
      pc.rotateMix = input.readFloat();
      pc.translateMix = input.readFloat();
      skeletonData.pathConstraints.push(pc);
    }

    var defaultSkin = readSkin335(bin, input, skeletonData, "default", nonessential);
    if (defaultSkin != null) {
      skeletonData.defaultSkin = defaultSkin;
      skeletonData.skins.push(defaultSkin);
    }

    n = input.readInt(true);
    for (i = 0; i < n; i++) {
      var sn = nonNullName(input.readString());
      var sk = readSkin335(bin, input, skeletonData, sn, nonessential);
      if (sk != null) skeletonData.skins.push(sk);
    }

    var lm = bin.linkedMeshes;
    for (i = 0, n = lm.length; i < n; i++) {
      var linked = lm[i];
      var skin =
        linked.skin == null ? skeletonData.defaultSkin : skeletonData.findSkin(linked.skin);
      if (skin == null) throw new Error("Skin not found: " + linked.skin);
      var parentAtt = skin.getAttachment(linked.slotIndex, linked.parent);
      if (parentAtt == null) throw new Error("Parent mesh not found: " + linked.parent);
      linked.mesh.deformAttachment = linked.inheritDeform ? parentAtt : linked.mesh;
      linked.mesh.setParentMesh(parentAtt);
      linked.mesh.updateUVs();
    }
    lm.length = 0;

    n = input.readInt(true);
    for (i = 0; i < n; i++) {
      var ed = new spine.EventData(nonNullName(input.readString()));
      ed.intValue = input.readInt(false);
      ed.floatValue = input.readFloat();
      ed.stringValue = input.readString();
      skeletonData.events.push(ed);
    }

    n = input.readInt(true);
    var SB = spine.SkeletonBinary.prototype;
    for (i = 0; i < n; i++) {
      var animName = nonNullName(input.readString());
      skeletonData.animations.push(readAnimation335(bin, input, animName, skeletonData, pre35));
    }

    return skeletonData;
  }

  function readAnimation335(bin, input, name, skeletonData, pre35) {
    var SB = spine.SkeletonBinary.prototype;
    var X = spine.SkeletonBinary;
    var timelines = [];
    var scale = bin.scale;
    var duration = 0;
    var tempColor1 = new spine.Color();
    var tempColor2 = new spine.Color();
    var i,
      ii,
      iii,
      n,
      nn,
      nnn,
      frameIndex,
      timelineType,
      frameCount;

    for (i = 0, n = input.readInt(true); i < n; i++) {
      var slotIndex = input.readInt(true);
      for (ii = 0, nn = input.readInt(true); ii < nn; ii++) {
        timelineType = input.readByte();
        frameCount = input.readInt(true);
        if (pre35 && timelineType === X.SLOT_TWO_COLOR) {
          throw new Error(
            "SLOT_TWO_COLOR timeline in Spine < 3.5 export is not supported (unexpected type " + timelineType + ")."
          );
        }
        switch (timelineType) {
          case X.SLOT_ATTACHMENT: {
            var tlA = new spine.AttachmentTimeline(frameCount);
            tlA.slotIndex = slotIndex;
            for (frameIndex = 0; frameIndex < frameCount; frameIndex++)
              tlA.setFrame(frameIndex, input.readFloat(), input.readStringRef());
            timelines.push(tlA);
            duration = Math.max(duration, tlA.frames[frameCount - 1]);
            break;
          }
          case X.SLOT_COLOR: {
            var tlC = new spine.ColorTimeline(frameCount);
            tlC.slotIndex = slotIndex;
            for (frameIndex = 0; frameIndex < frameCount; frameIndex++) {
              var t = input.readFloat();
              spine.Color.rgba8888ToColor(tempColor1, input.readInt32());
              tlC.setFrame(frameIndex, t, tempColor1.r, tempColor1.g, tempColor1.b, tempColor1.a);
              if (frameIndex < frameCount - 1) SB.readCurve.call(bin, input, frameIndex, tlC);
            }
            timelines.push(tlC);
            duration = Math.max(duration, tlC.frames[(frameCount - 1) * spine.ColorTimeline.ENTRIES]);
            break;
          }
          case X.SLOT_TWO_COLOR: {
            var tl2 = new spine.TwoColorTimeline(frameCount);
            tl2.slotIndex = slotIndex;
            for (frameIndex = 0; frameIndex < frameCount; frameIndex++) {
              var t2 = input.readFloat();
              spine.Color.rgba8888ToColor(tempColor1, input.readInt32());
              spine.Color.rgb888ToColor(tempColor2, input.readInt32());
              tl2.setFrame(
                frameIndex,
                t2,
                tempColor1.r,
                tempColor1.g,
                tempColor1.b,
                tempColor1.a,
                tempColor2.r,
                tempColor2.g,
                tempColor2.b
              );
              if (frameIndex < frameCount - 1) SB.readCurve.call(bin, input, frameIndex, tl2);
            }
            timelines.push(tl2);
            duration = Math.max(duration, tl2.frames[(frameCount - 1) * spine.TwoColorTimeline.ENTRIES]);
            break;
          }
        }
      }
    }

    for (i = 0, n = input.readInt(true); i < n; i++) {
      var boneIndex = input.readInt(true);
      for (ii = 0, nn = input.readInt(true); ii < nn; ii++) {
        timelineType = input.readByte();
        frameCount = input.readInt(true);
        switch (timelineType) {
          case X.BONE_ROTATE: {
            var tlR = new spine.RotateTimeline(frameCount);
            tlR.boneIndex = boneIndex;
            for (frameIndex = 0; frameIndex < frameCount; frameIndex++) {
              tlR.setFrame(frameIndex, input.readFloat(), input.readFloat());
              if (frameIndex < frameCount - 1) SB.readCurve.call(bin, input, frameIndex, tlR);
            }
            timelines.push(tlR);
            duration = Math.max(duration, tlR.frames[(frameCount - 1) * spine.RotateTimeline.ENTRIES]);
            break;
          }
          case X.BONE_TRANSLATE:
          case X.BONE_SCALE:
          case X.BONE_SHEAR: {
            var tlT;
            var timelineScale = 1;
            if (timelineType === X.BONE_SCALE) tlT = new spine.ScaleTimeline(frameCount);
            else if (timelineType === X.BONE_SHEAR) tlT = new spine.ShearTimeline(frameCount);
            else {
              tlT = new spine.TranslateTimeline(frameCount);
              timelineScale = scale;
            }
            tlT.boneIndex = boneIndex;
            for (frameIndex = 0; frameIndex < frameCount; frameIndex++) {
              tlT.setFrame(
                frameIndex,
                input.readFloat(),
                input.readFloat() * timelineScale,
                input.readFloat() * timelineScale
              );
              if (frameIndex < frameCount - 1) SB.readCurve.call(bin, input, frameIndex, tlT);
            }
            timelines.push(tlT);
            duration = Math.max(duration, tlT.frames[(frameCount - 1) * spine.TranslateTimeline.ENTRIES]);
            break;
          }
        }
      }
    }

    /* IK: 3.3–3.7 store mix + bend only; 3.8 adds softness + compress + stretch. */
    for (i = 0, n = input.readInt(true); i < n; i++) {
      var ikIndex = input.readInt(true);
      frameCount = input.readInt(true);
      var tlIk = new spine.IkConstraintTimeline(frameCount);
      tlIk.ikConstraintIndex = ikIndex;
      for (frameIndex = 0; frameIndex < frameCount; frameIndex++) {
        tlIk.setFrame(
          frameIndex,
          input.readFloat(),
          input.readFloat(),
          0,
          readSByte(input),
          false,
          false
        );
        if (frameIndex < frameCount - 1) SB.readCurve.call(bin, input, frameIndex, tlIk);
      }
      timelines.push(tlIk);
      duration = Math.max(duration, tlIk.frames[(frameCount - 1) * spine.IkConstraintTimeline.ENTRIES]);
    }

    for (i = 0, n = input.readInt(true); i < n; i++) {
      var tcIndex = input.readInt(true);
      frameCount = input.readInt(true);
      var tlTc = new spine.TransformConstraintTimeline(frameCount);
      tlTc.transformConstraintIndex = tcIndex;
      for (frameIndex = 0; frameIndex < frameCount; frameIndex++) {
        tlTc.setFrame(
          frameIndex,
          input.readFloat(),
          input.readFloat(),
          input.readFloat(),
          input.readFloat(),
          input.readFloat()
        );
        if (frameIndex < frameCount - 1) SB.readCurve.call(bin, input, frameIndex, tlTc);
      }
      timelines.push(tlTc);
      duration = Math.max(duration, tlTc.frames[(frameCount - 1) * spine.TransformConstraintTimeline.ENTRIES]);
    }

    for (i = 0, n = input.readInt(true); i < n; i++) {
      var pathIndex = input.readInt(true);
      var pathData = skeletonData.pathConstraints[pathIndex];
      for (ii = 0, nn = input.readInt(true); ii < nn; ii++) {
        timelineType = input.readByte();
        frameCount = input.readInt(true);
        switch (timelineType) {
          case X.PATH_POSITION:
          case X.PATH_SPACING: {
            var tlP;
            var pScale = 1;
            if (timelineType === X.PATH_SPACING) {
              tlP = new spine.PathConstraintSpacingTimeline(frameCount);
              if (pathData.spacingMode === spine.SpacingMode.Length || pathData.spacingMode === spine.SpacingMode.Fixed)
                pScale = scale;
            } else {
              tlP = new spine.PathConstraintPositionTimeline(frameCount);
              if (pathData.positionMode === spine.PositionMode.Fixed) pScale = scale;
            }
            tlP.pathConstraintIndex = pathIndex;
            for (frameIndex = 0; frameIndex < frameCount; frameIndex++) {
              tlP.setFrame(frameIndex, input.readFloat(), input.readFloat() * pScale);
              if (frameIndex < frameCount - 1) SB.readCurve.call(bin, input, frameIndex, tlP);
            }
            timelines.push(tlP);
            duration = Math.max(duration, tlP.frames[(frameCount - 1) * spine.PathConstraintPositionTimeline.ENTRIES]);
            break;
          }
          case X.PATH_MIX: {
            var tlM = new spine.PathConstraintMixTimeline(frameCount);
            tlM.pathConstraintIndex = pathIndex;
            for (frameIndex = 0; frameIndex < frameCount; frameIndex++) {
              tlM.setFrame(frameIndex, input.readFloat(), input.readFloat(), input.readFloat());
              if (frameIndex < frameCount - 1) SB.readCurve.call(bin, input, frameIndex, tlM);
            }
            timelines.push(tlM);
            duration = Math.max(duration, tlM.frames[(frameCount - 1) * spine.PathConstraintMixTimeline.ENTRIES]);
            break;
          }
        }
      }
    }

    for (i = 0, n = input.readInt(true); i < n; i++) {
      var skin = skeletonData.skins[input.readInt(true)];
      for (ii = 0, nn = input.readInt(true); ii < nn; ii++) {
        var defSlot = input.readInt(true);
        for (iii = 0, nnn = input.readInt(true); iii < nnn; iii++) {
          var vatt = skin.getAttachment(defSlot, input.readStringRef());
          var weighted = vatt.bones != null;
          var verts = vatt.vertices;
          var deformLength = weighted ? (verts.length / 3) * 2 : verts.length;
          frameCount = input.readInt(true);
          var tlD = new spine.DeformTimeline(frameCount);
          tlD.slotIndex = defSlot;
          tlD.attachment = vatt;
          for (frameIndex = 0; frameIndex < frameCount; frameIndex++) {
            var timeD = input.readFloat();
            var deform;
            var end = input.readInt(true);
            if (end === 0) deform = weighted ? spine.Utils.newFloatArray(deformLength) : verts;
            else {
              deform = spine.Utils.newFloatArray(deformLength);
              var start = input.readInt(true);
              end += start;
              if (scale === 1) {
                for (var v = start; v < end; v++) deform[v] = input.readFloat();
              } else {
                for (var v2 = start; v2 < end; v2++) deform[v2] = input.readFloat() * scale;
              }
              if (!weighted) {
                for (var v3 = 0, vn = deform.length; v3 < vn; v3++) deform[v3] += verts[v3];
              }
            }
            tlD.setFrame(frameIndex, timeD, deform);
            if (frameIndex < frameCount - 1) SB.readCurve.call(bin, input, frameIndex, tlD);
          }
          timelines.push(tlD);
          duration = Math.max(duration, tlD.frames[frameCount - 1]);
        }
      }
    }

    var drawOrderCount = input.readInt(true);
    if (drawOrderCount > 0) {
      var tlDo = new spine.DrawOrderTimeline(drawOrderCount);
      var slotCount = skeletonData.slots.length;
      for (i = 0; i < drawOrderCount; i++) {
        var timeDo = input.readFloat();
        var offsetCount = input.readInt(true);
        var drawOrder = spine.Utils.newArray(slotCount, 0);
        for (ii = slotCount - 1; ii >= 0; ii--) drawOrder[ii] = -1;
        var unchanged = spine.Utils.newArray(slotCount - offsetCount, 0);
        var originalIndex = 0,
          unchangedIndex = 0;
        for (ii = 0; ii < offsetCount; ii++) {
          var sIdx = input.readInt(true);
          while (originalIndex !== sIdx) unchanged[unchangedIndex++] = originalIndex++;
          drawOrder[originalIndex + input.readInt(true)] = originalIndex++;
        }
        while (originalIndex < slotCount) unchanged[unchangedIndex++] = originalIndex++;
        for (ii = slotCount - 1; ii >= 0; ii--)
          if (drawOrder[ii] === -1) drawOrder[ii] = unchanged[--unchangedIndex];
        tlDo.setFrame(i, timeDo, drawOrder);
      }
      timelines.push(tlDo);
      duration = Math.max(duration, tlDo.frames[drawOrderCount - 1]);
    }

    var eventCount = input.readInt(true);
    if (eventCount > 0) {
      var tlEv = new spine.EventTimeline(eventCount);
      for (i = 0; i < eventCount; i++) {
        var timeEv = input.readFloat();
        var evData = skeletonData.events[input.readInt(true)];
        var ev = new spine.Event(timeEv, evData);
        ev.intValue = input.readInt(false);
        ev.floatValue = input.readFloat();
        ev.stringValue = input.readBoolean() ? input.readString() : evData.stringValue;
        if (evData.audioPath != null) {
          ev.volume = input.readFloat();
          ev.balance = input.readFloat();
        }
        tlEv.setFrame(i, ev);
      }
      timelines.push(tlEv);
      duration = Math.max(duration, tlEv.frames[eventCount - 1]);
    }

    return new spine.Animation(name, timelines, duration);
  }

  function peekVersion(bytes) {
    var input = new LegacyBinaryInput(bytes);
    input.readString();
    return input.readString() || "";
  }

  global.spineLegacyBinary = {
    shouldUseLegacy: shouldUseLegacy,
    peekVersion: peekVersion,
    readSkeletonData: readSkeletonData335,
  };
})(typeof window !== "undefined" ? window : globalThis);
