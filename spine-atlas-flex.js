/**
 * AtlasAttachmentLoader that resolves region paths more loosely (slashes, basename, no extension,
 * case-insensitive) and returns null instead of throwing so binary parsing can continue.
 */
(function (global) {
  "use strict";

  function createFlexAtlasAttachmentLoader(atlas) {
    var base = new spine.AtlasAttachmentLoader(atlas);

    function resolve(path) {
      if (path == null || path === "") return null;
      var p = String(path);
      var r = atlas.findRegion(p);
      if (r) return r;
      var norm = p.replace(/\\/g, "/");
      if (norm !== p) {
        r = atlas.findRegion(norm);
        if (r) return r;
      }
      var slash = Math.max(norm.lastIndexOf("/"), norm.lastIndexOf("\\"));
      var short = slash >= 0 ? norm.slice(slash + 1) : norm;
      r = atlas.findRegion(short);
      if (r) return r;
      var dot = short.lastIndexOf(".");
      if (dot > 0) {
        r = atlas.findRegion(short.slice(0, dot));
        if (r) return r;
      }
      var low = norm.toLowerCase();
      var shortLow = short.toLowerCase();
      var regs = atlas.regions;
      for (var i = 0, n = regs.length; i < n; i++) {
        var reg = regs[i];
        var rn = reg.name;
        if (!rn) continue;
        if (rn === p || rn === norm || rn === short) return reg;
        var rnl = rn.toLowerCase();
        if (rnl === low || rnl === shortLow) return reg;
        /* Path suffix only — bare endsWith(short) matches the wrong region when names share endings. */
        if (rnl.endsWith("/" + shortLow) || rnl.endsWith("/" + low)) return reg;
      }
      return null;
    }

    return {
      newRegionAttachment: function (skin, name, path) {
        var region = resolve(path != null ? path : name);
        if (region == null) region = resolve(name);
        if (region == null) {
          console.warn("[spine-viewer] Region not in atlas:", path, "(attachment:", name + ")");
          return null;
        }
        region.renderObject = region;
        var att = new spine.RegionAttachment(name);
        att.setRegion(region);
        return att;
      },
      newMeshAttachment: function (skin, name, path) {
        var region = resolve(path != null ? path : name);
        if (region == null) region = resolve(name);
        if (region == null) {
          console.warn("[spine-viewer] Mesh atlas region not found:", path, "(attachment:", name + ")");
          return null;
        }
        region.renderObject = region;
        var att = new spine.MeshAttachment(name);
        att.region = region;
        return att;
      },
      newBoundingBoxAttachment: function (skin, name) {
        return base.newBoundingBoxAttachment(skin, name);
      },
      newPathAttachment: function (skin, name) {
        return base.newPathAttachment(skin, name);
      },
      newPointAttachment: function (skin, name) {
        return base.newPointAttachment(skin, name);
      },
      newClippingAttachment: function (skin, name) {
        return base.newClippingAttachment(skin, name);
      },
    };
  }

  global.spineFlexAtlas = { createFlexAtlasAttachmentLoader: createFlexAtlasAttachmentLoader };
})(typeof window !== "undefined" ? window : globalThis);
