// src/components/ResultsActions.jsx
import React, { useState } from 'react';
import {
  Share2,
  FileText,
  Image as ImageIcon,
  Mail,
  Zap,
  X,
  Check,
  Save
} from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// DB_URL: adjust for your environment (frontend)
const DB_URL =
  typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:5000'
    : `http://${window.location.hostname}:5000`;

export const ResultsActions = ({ data = {}, image = null, type = 'disease', reportRef }) => {
  const [processing, setProcessing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [saved, setSaved] = useState(false);

  // email modal state
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');

  const makeFilename = (ext) => {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const label = (type === 'disease' ? data?.diseaseName : data?.pestName) || 'report';
    return `AgriSentry_${label.replace(/\s+/g, '_')}_${ts}.${ext}`;
  };

  // html2canvas helper
  const generateCanvas = async () => {
    if (!reportRef || !reportRef.current) return null;
    try {
      const node = reportRef.current;
      const imgs = Array.from(node.getElementsByTagName('img'));
      await Promise.all(
        imgs.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((res) => {
                img.onload = res;
                img.onerror = res;
              })
        )
      );
      const canvas = await html2canvas(node, { useCORS: true, scale: 2, backgroundColor: '#ffffff' });
      return canvas;
    } catch (err) {
      console.error('Canvas error', err);
      return null;
    }
  };

  const canvasToBlob = (canvas, mime = 'image/jpeg', quality = 0.92) =>
    new Promise((resolve) => canvas.toBlob((b) => resolve(b), mime, quality));

  // multi-page PDF blob
  const generateMultiPagePdfBlob = async () => {
    const canvas = await generateCanvas();
    if (!canvas) return null;

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidthMM = pdf.internal.pageSize.getWidth();
    const pdfHeightMM = pdf.internal.pageSize.getHeight();

    const pxPerMM = canvas.width / pdfWidthMM;
    const pageHeightPx = Math.floor(pdfHeightMM * pxPerMM);
    const pages = Math.ceil(canvas.height / pageHeightPx);

    for (let p = 0; p < pages; p++) {
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      const sliceHeight = p === pages - 1 ? canvas.height - p * pageHeightPx : pageHeightPx;
      sliceCanvas.height = sliceHeight;

      const ctx = sliceCanvas.getContext('2d');
      ctx.drawImage(canvas, 0, p * pageHeightPx, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

      const imgData = sliceCanvas.toDataURL('image/jpeg', 0.95);
      const imgWidthMM = pdfWidthMM;
      const imgHeightMM = sliceHeight / pxPerMM;

      if (p > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, 0, imgWidthMM, imgHeightMM);
    }

    return pdf.output('blob');
  };

  // Download PDF action
  const onDownloadPDF = async () => {
    setProcessing(true);
    setShowMenu(false);
    try {
      const blob = await generateMultiPagePdfBlob();
      if (!blob) {
        alert('Could not generate PDF.');
        setProcessing(false);
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = makeFilename('pdf');
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('download PDF error', err);
      alert('Failed to generate PDF.');
    } finally {
      setProcessing(false);
    }
  };

  // Download JPG action
  const onDownloadJPG = async () => {
    setProcessing(true);
    setShowMenu(false);
    try {
      const canvas = await generateCanvas();
      if (!canvas) {
        alert('Could not render image.');
        setProcessing(false);
        return;
      }
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/jpeg', 0.92);
      link.download = makeFilename('jpg');
      link.click();
    } catch (err) {
      console.error('download JPG error', err);
      alert('Failed to download image.');
    } finally {
      setProcessing(false);
    }
  };

  // Open email modal (no prompt)
  const openEmailModal = () => {
    setRecipientEmail(''); // user may type, leave blank to use server default
    setEmailModalOpen(true);
    setShowMenu(false);
  };

  // Send email via backend (uploads PDF)
  const sendEmail = async () => {
    setProcessing(true);
    try {
      const pdfBlob = await generateMultiPagePdfBlob();
      if (!pdfBlob) {
        alert('Could not render PDF.');
        setProcessing(false);
        return;
      }

      const form = new FormData();
      form.append('file', pdfBlob, makeFilename('pdf'));
      if (recipientEmail && recipientEmail.trim()) form.append('to', recipientEmail.trim());
      form.append('subject', `Agri-Sentry Report: ${type === 'disease' ? data?.diseaseName : data?.pestName || ''}`);
      form.append('body', `Diagnosis: ${type === 'disease' ? data?.diseaseName : data?.pestName}\nSeverity: ${String(data?.severity).toUpperCase()}`);

      const res = await fetch(`${DB_URL}/api/send-report`, { method: 'POST', body: form });
      if (!res.ok) {
        const text = await res.text().catch(() => 'Email failed');
        throw new Error(text || 'Email failed');
      }

      alert('Email sent successfully.');
      setEmailModalOpen(false);
    } catch (err) {
      console.error('sendEmail error', err);
      alert('Failed to send email. Check server logs and SMTP config.');
    } finally {
      setProcessing(false);
    }
  };

  // Share with other apps - native share or fallback
  const onShareOther = async () => {
    setProcessing(true);
    setShowMenu(false);
    try {
      const canvas = await generateCanvas();
      if (!canvas) {
        alert('Could not prepare share content.');
        setProcessing(false);
        return;
      }
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
      const file = new File([blob], makeFilename('jpg'), { type: 'image/jpeg' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `Agri-Sentry: ${type === 'disease' ? data?.diseaseName : data?.pestName}`,
          text: `Detected: ${type === 'disease' ? data?.diseaseName : data?.pestName}\nRisk: ${String(data?.severity).toUpperCase()}`,
          files: [file]
        });
        setProcessing(false);
        return;
      }

      // fallback: copy summary and open WhatsApp web with text
      const treat = data?.treatments?.[0] ?? 'See app for details';
      const summary = `Agri-Sentry Alert: ${type === 'disease' ? data?.diseaseName : data?.pestName}\nRisk: ${String(data?.severity).toUpperCase()}\nTreatment: ${treat}\n\nOpen the app for full analysis.`;
      try {
        await navigator.clipboard.writeText(summary);
      } catch (err) {
        console.warn('Clipboard write failed', err);
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(summary)}`, '_blank');
    } catch (err) {
      console.error('share other error', err);
      alert('Could not share via other apps.');
    } finally {
      setProcessing(false);
    }
  };

  // placeholder save
  const onSave = async () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="mt-6 pt-6 border-t border-slate-100 relative">
      <div className="flex gap-3">
        {/* <button
          onClick={onSave}
          disabled={processing}
          className={`flex-1 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
            saved ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-slate-900 text-white hover:bg-slate-800'
          }`}
        >
          <Check size={16} /> {saved ? 'Saved' : 'Save'}
        </button> */}

        <button
          onClick={() => setShowMenu((s) => !s)}
          disabled={processing}
          className="w-20 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center hover:bg-blue-100 border border-blue-100 text-sm gap-1"
          title="Share"
        >
          Share 
          <Share2 size={16} />
        </button>
      </div>

      {/* Share menu: four actions */}
      {showMenu && (
        <div className="absolute bottom-full right-0 mb-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-200 p-3 z-50">
          <div className="flex justify-between items-center mb-2">
            <strong className="text-sm text-slate-600">Share / Export</strong>
            <button onClick={() => setShowMenu(false)} className="text-slate-400 hover:text-red-500"><X size={16} /></button>
          </div>

          <div className="space-y-2">
            <button onClick={onDownloadPDF} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 border border-slate-100">
              <div className="w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center"><FileText size={14} /></div>
              <div className="text-left"><div className="font-bold text-sm">Download PDF</div><div className="text-xs text-slate-400">Multi-page A4</div></div>
            </button>

            <button onClick={onDownloadJPG} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 border border-slate-100">
              <div className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center"><ImageIcon size={14} /></div>
              <div className="text-left"><div className="font-bold text-sm">Download JPG</div><div className="text-xs text-slate-400">High-quality image</div></div>
            </button>

            <button onClick={openEmailModal} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 border border-slate-100">
              <div className="w-8 h-8 bg-yellow-600 text-white rounded-full flex items-center justify-center"><Mail size={14} /></div>
              <div className="text-left"><div className="font-bold text-sm">Share via Email</div><div className="text-xs text-slate-400">Attach PDF & send</div></div>
            </button>

            <button onClick={onShareOther} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 border border-slate-100">
              <div className="w-8 h-8 bg-emerald-500 text-white rounded-full flex items-center justify-center"><Zap size={14} /></div>
              <div className="text-left"><div className="font-bold text-sm">Share with other apps</div><div className="text-xs text-slate-400">Native or WhatsApp fallback</div></div>
            </button>
          </div>
        </div>
      )}

      {/* Email Modal (replaces prompt) */}
      {emailModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg text-slate-800">Send Report by Email</h3>
              <button onClick={() => setEmailModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>

            <p className="text-sm text-slate-500 mb-3">Leave the recipient empty to use the server's default email address.</p>

            <label className="text-xs text-slate-500 mb-1 block">Recipient Email (optional)</label>
            <input
              type="email"
              placeholder="recipient@example.com"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              className="w-full border border-slate-200 rounded-xl p-3 mb-4 focus:ring-2 focus:ring-lime-300 outline-none"
            />

            <div className="flex justify-end gap-3">
              <button onClick={() => setEmailModalOpen(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={sendEmail} disabled={processing} className="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2">
                {processing && <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>}
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultsActions;
