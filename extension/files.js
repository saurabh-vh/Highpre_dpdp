/*
 * HighPre file reading for the browser extension. Pulls the text out of a file
 * someone is about to attach, so detect() can check it. Everything happens in
 * this browser, in memory: the file and its text are never sent anywhere.
 * No libraries: zip entries (.xlsx, .docx) and PDF streams are inflated with
 * the browser's own DecompressionStream.
 */
(function (root) {
  "use strict";

  var MAX_FILE_BYTES = 10 * 1024 * 1024;
  var MAX_TEXT = 200000; // the detector's limit
  var TEXT_TYPES = ["txt", "csv", "tsv", "json", "md", "log", "html", "htm", "xml"];
  var ZIP_TYPES = ["xlsx", "docx"];

  function extensionOf(name) {
    var m = /\.([a-z0-9]+)$/i.exec(name || "");
    return m ? m[1].toLowerCase() : "";
  }

  /** True when HighPre knows how to read this file and it isn't too big. */
  function canCheck(file) {
    if (!file || typeof file.size !== "number" || file.size === 0 || file.size > MAX_FILE_BYTES) return false;
    var ext = extensionOf(file.name);
    return TEXT_TYPES.indexOf(ext) >= 0 || ZIP_TYPES.indexOf(ext) >= 0 || ext === "pdf";
  }

  function cap(text) {
    return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text;
  }

  /* ── XML ── */

  function decodeEntities(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, function (m, e) {
      var k = e.toLowerCase();
      if (k === "lt") return "<";
      if (k === "gt") return ">";
      if (k === "amp") return "&";
      if (k === "quot") return '"';
      if (k === "apos") return "'";
      var code = k[1] === "x" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
      try {
        return String.fromCodePoint(code);
      } catch {
        return "";
      }
    });
  }

  /** Removes tags (each becomes a space, so words don't run together) and decodes entities. */
  function stripXml(xml) {
    return decodeEntities(String(xml).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]*>/g, " ")).replace(/[ \t]+/g, " ").trim();
  }

  /** Concatenated contents of every <tag>…</tag> (namespaced tags like w:t match "w:t"). */
  function textOfTags(xml, tag) {
    var re = new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)</" + tag + ">", "g");
    var out = "";
    var m;
    while ((m = re.exec(xml)) !== null) out += m[1];
    return decodeEntities(out.replace(/<[^>]*>/g, ""));
  }

  /* ── Zip ── */

  function inflate(bytes, format) {
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
    return new Response(stream).arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
  }

  /** Reads the named entries of a zip archive. Returns { name: Uint8Array }; missing entries are left out. */
  function readZipEntries(bytes, wanted) {
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var eocd = -1;
    for (var i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) return Promise.resolve({});
    var count = view.getUint16(eocd + 10, true);
    var p = view.getUint32(eocd + 16, true);
    var dec = new TextDecoder();
    var jobs = [];
    for (var n = 0; n < count && p + 46 <= bytes.length; n++) {
      if (view.getUint32(p, true) !== 0x02014b50) break;
      var method = view.getUint16(p + 10, true);
      var size = view.getUint32(p + 20, true);
      var nameLen = view.getUint16(p + 28, true);
      var extraLen = view.getUint16(p + 30, true);
      var commentLen = view.getUint16(p + 32, true);
      var local = view.getUint32(p + 42, true);
      var name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
      p += 46 + nameLen + extraLen + commentLen;
      if (!wanted(name) || local + 30 > bytes.length) continue;
      var start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      var data = bytes.subarray(start, Math.min(start + size, bytes.length));
      jobs.push(
        (function (entryName, entryData, entryMethod) {
          var read = entryMethod === 0 ? Promise.resolve(entryData) : entryMethod === 8 ? inflate(entryData, "deflate-raw") : Promise.resolve(null);
          return read.then(
            function (out) { return [entryName, out]; },
            function () { return [entryName, null]; },
          );
        })(name, data, method),
      );
    }
    return Promise.all(jobs).then(function (pairs) {
      var out = {};
      pairs.forEach(function (pair) {
        if (pair[1]) out[pair[0]] = pair[1];
      });
      return out;
    });
  }

  /* ── Office files ── */

  function sheetNumber(name) {
    var m = /sheet(\d+)\.xml$/.exec(name);
    return m ? Number(m[1]) : 0;
  }

  /** Text of a spreadsheet: one line per row, cells separated by tabs. */
  function xlsxTextFromXml(sharedStringsXml, sheetXmls) {
    var shared = [];
    var si = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;
    var m;
    while ((m = si.exec(sharedStringsXml || "")) !== null) shared.push(textOfTags(m[1], "t"));
    var lines = [];
    sheetXmls.forEach(function (xml) {
      var row = /<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g;
      var r;
      while ((r = row.exec(xml)) !== null) {
        var cells = [];
        var cell = /<c(\s[^>]*)?(?:\/>|>([\s\S]*?)<\/c>)/g;
        var c;
        while ((c = cell.exec(r[1])) !== null) {
          var attrs = c[1] || "";
          var body = c[2] || "";
          var type = (/\bt="([^"]*)"/.exec(attrs) || [])[1];
          var v = textOfTags(body, "v");
          if (type === "s") cells.push(shared[Number(v)] || "");
          else if (type === "inlineStr") cells.push(textOfTags(body, "t"));
          else if (/^-?\d+(?:\.\d+)?E\+\d+$/i.test(v) && Math.abs(Number(v)) < 1e21) cells.push(Number(v).toFixed(0)); // long numbers saved in scientific form
          else cells.push(v);
        }
        lines.push(cells.join("\t"));
      }
    });
    return lines.join("\n");
  }

  /** Text of a Word document: one line per paragraph. */
  function docxTextFromXml(documentXml) {
    var paras = [];
    var p = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g;
    var m;
    while ((m = p.exec(documentXml)) !== null) {
      paras.push(textOfTags(m[1].replace(/<w:tab\/>/g, "<w:t>\t</w:t>").replace(/<w:br\/>/g, "<w:t>\n</w:t>"), "w:t"));
    }
    return paras.join("\n");
  }

  function extractXlsxText(bytes) {
    return readZipEntries(bytes, function (n) { return n === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n); }).then(function (entries) {
      var dec = new TextDecoder();
      var sheets = Object.keys(entries)
        .filter(function (n) { return n !== "xl/sharedStrings.xml"; })
        .sort(function (a, b) { return sheetNumber(a) - sheetNumber(b); })
        .map(function (n) { return dec.decode(entries[n]); });
      var shared = entries["xl/sharedStrings.xml"] ? dec.decode(entries["xl/sharedStrings.xml"]) : "";
      return cap(xlsxTextFromXml(shared, sheets));
    });
  }

  function extractDocxText(bytes) {
    return readZipEntries(bytes, function (n) { return n === "word/document.xml"; }).then(function (entries) {
      var doc = entries["word/document.xml"];
      return doc ? cap(docxTextFromXml(new TextDecoder().decode(doc))) : "";
    });
  }

  /* ── PDF (best effort) ── */

  function latin1(bytes) {
    var out = "";
    for (var i = 0; i < bytes.length; i += 8192) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return out;
  }

  function unescapePdfString(s) {
    return s.replace(/\\([nrtbf()\\]|[0-7]{1,3}|\r?\n)/g, function (m, e) {
      if (e === "n" || e === "r") return "\n";
      if (e === "t") return "\t";
      if (e === "b" || e === "f") return "";
      if (/^[0-7]+$/.test(e)) return String.fromCharCode(parseInt(e, 8));
      if (e[0] === "\r" || e[0] === "\n") return "";
      return e;
    });
  }

  /** Text shown by a page's content stream: strings drawn with Tj, TJ, ' and ". */
  function pdfTextFromContent(content) {
    if (content.indexOf("BT") < 0) return "";
    var out = "";
    var re = /\[((?:\((?:\\[\s\S]|[^\\)])*\)|[^\]()])*)\]\s*TJ|\(((?:\\[\s\S]|[^\\)])*)\)\s*(?:Tj|'|")|(\b(?:Td|TD|Tm|ET)\b|T\*)/g;
    var m;
    while ((m = re.exec(content)) !== null) {
      if (m[1] !== undefined) {
        var part = /\(((?:\\[\s\S]|[^\\)])*)\)|(-?\d+(?:\.\d+)?)/g;
        var q;
        while ((q = part.exec(m[1])) !== null) {
          if (q[1] !== undefined) out += unescapePdfString(q[1]);
          else if (Number(q[2]) < -200) out += " "; // a wide gap is a space between words
        }
      } else if (m[2] !== undefined) out += unescapePdfString(m[2]);
      else out += "\n";
      if (out.length > MAX_TEXT) break;
    }
    return out;
  }

  function extractPdfText(bytes) {
    var raw = latin1(bytes);
    if (raw.slice(0, 1024).indexOf("%PDF") < 0) return Promise.resolve("");
    var jobs = [];
    var re = /<<((?:[^<>]|<<(?:[^<>]|<<[^<>]*>>)*>>|<[^<>]*>)*)>>\s*stream\r?\n/g;
    var m;
    while ((m = re.exec(raw)) !== null && jobs.length < 500) {
      var dict = m[1];
      var start = re.lastIndex;
      var end = raw.indexOf("endstream", start);
      if (end < 0) break;
      re.lastIndex = end;
      var length = /\/Length\s+(\d+)\b(?!\s+\d+\s+R)/.exec(dict);
      if (length && start + Number(length[1]) <= end) end = start + Number(length[1]);
      else while (end > start && /[\r\n ]/.test(raw[end - 1])) end--; // the line break before "endstream"
      if (/\/Subtype\s*\/Image|\/Type\s*\/(?:XRef|ObjStm|Metadata)/.test(dict)) continue;
      var filter = (/\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(dict) || [])[1] || "";
      var data = bytes.subarray(start, end);
      if (!filter) jobs.push(Promise.resolve(raw.slice(start, end)));
      else if (/^(?:\/FlateDecode|\[\s*\/FlateDecode\s*\])$/.test(filter.trim())) {
        jobs.push(
          inflate(data, "deflate").then(
            function (out) { return latin1(out); },
            function () { return ""; },
          ),
        );
      }
    }
    return Promise.all(jobs).then(function (contents) {
      var text = "";
      for (var i = 0; i < contents.length && text.length < MAX_TEXT; i++) {
        var t = pdfTextFromContent(contents[i]);
        if (t.trim()) text += t + "\n";
      }
      return cap(text);
    });
  }

  /* ── Any file ── */

  function readBytes(file) {
    return file.arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
  }

  /**
   * Resolves to the text inside a file, or "" when HighPre can't read it (an
   * unknown type, too big, encrypted, scanned and so on). Never rejects.
   */
  function extractFileText(file) {
    if (!canCheck(file)) return Promise.resolve("");
    var ext = extensionOf(file.name);
    var work;
    if (TEXT_TYPES.indexOf(ext) >= 0) {
      // A character is at most 4 bytes, so this is always enough for the detector.
      work = file.slice(0, MAX_TEXT * 4).text().then(cap);
    } else if (ext === "xlsx") work = readBytes(file).then(extractXlsxText);
    else if (ext === "docx") work = readBytes(file).then(extractDocxText);
    else work = readBytes(file).then(extractPdfText);
    return work.then(
      function (t) { return t || ""; },
      function () { return ""; },
    );
  }

  var api = {
    canCheck: canCheck,
    extractFileText: extractFileText,
    extractXlsxText: extractXlsxText,
    extractDocxText: extractDocxText,
    extractPdfText: extractPdfText,
    xlsxTextFromXml: xlsxTextFromXml,
    docxTextFromXml: docxTextFromXml,
    pdfTextFromContent: pdfTextFromContent,
    readZipEntries: readZipEntries,
    stripXml: stripXml,
  };
  root.HighPreFiles = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
