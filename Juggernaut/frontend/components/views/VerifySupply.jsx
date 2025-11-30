import React, { useState, useRef, useEffect } from 'react';
import jsQR from 'jsqr';
import { ethers } from 'ethers'; // BLOCKCHAIN IMPORT
// Make sure this path points to where you created the folder. 
// If it errors, try '../blockchain/config' or '../../blockchain/config'
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '/../blockchain/config';

import { FileUpload } from '../FileUpload';
import { ShieldCheck, QrCode, CheckCircle, Camera, Loader2, ScanLine, AlertCircle, RefreshCw, XCircle, Package, Lock, Plus, Save, Calendar, Building, Wand2, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { translations } from '../../translations';


// --- CONFIGURATION ---
const getBaseUrl = () => {
  if (window.location.hostname === 'localhost') {
    return "http://localhost:5000";
  }
  return `http://${window.location.hostname}:5000`;
};
const API_URL = getBaseUrl();

export const VerifySupply = ({ language }) => {
  const t = translations[language];
  
  // --- Main States ---
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null); // 'success' or 'error'
  const [productData, setProductData] = useState(null);
  
  // --- Camera States ---
  const [cameraActive, setCameraActive] = useState(true);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [scannedData, setScannedData] = useState(null);
  
  // --- Registration & Vision States ---
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [labelImage, setLabelImage] = useState(null); 

  const [regForm, setRegForm] = useState({
    productName: '',
    manufacturer: '',
    batchNumber: '',
  });

  const [manualFile, setManualFile] = useState(null);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const requestRef = useRef(null);
  const labelInputRef = useRef(null); 

  // --- CAMERA LOGIC ---
  const initCamera = async () => {
    if (!cameraActive || scannedData || verificationResult || showRegisterModal) return;

    try {
      setCameraLoading(true);
      setCameraError(null);
      setPermissionDenied(false);

      const constraints = { 
        video: { 
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
            videoRef.current.play()
              .then(() => setCameraLoading(false))
              .catch(e => console.warn("Autoplay blocked:", e));
        };
      }
    } catch (err) {
      console.error("Camera init error:", err);
      setCameraLoading(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setPermissionDenied(true);
          setCameraError("Camera permission was denied.");
      } else {
          setCameraError(t.cameraError || "Camera error");
      }
      setCameraActive(false);
    }
  };

  useEffect(() => {
    initCamera();
    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [cameraActive, scannedData, verificationResult, showRegisterModal]);

  // --- QR SCANNING LOOP ---
  useEffect(() => {
    if (!cameraActive || scannedData || verificationResult || cameraLoading || showRegisterModal) return;

    const scan = () => {
       if (videoRef.current && canvasRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
         const video = videoRef.current;
         const canvas = canvasRef.current;
         const ctx = canvas.getContext('2d', { willReadFrequently: true });

         if (ctx) {
             canvas.width = video.videoWidth;
             canvas.height = video.videoHeight;
             ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
             
             const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
             const code = jsQR(imageData.data, imageData.width, imageData.height, {
               inversionAttempts: "dontInvert",
             });

             if (code && code.data) {
               handleScannedCode(code.data);
               return; 
             }
         }
       }
       requestRef.current = requestAnimationFrame(scan);
    };

    requestRef.current = requestAnimationFrame(scan);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [cameraActive, scannedData, verificationResult, cameraLoading, showRegisterModal]);


  // --- VISION API AUTO-FILL (Kept existing AI logic) ---
  const handleLabelImageSelect = (e) => {
      const file = e.target.files[0];
      if (file) {
        setLabelImage(file);
        handleAutoFill(file);
      }
  };

  const handleAutoFill = async (fileToScan) => {
     const file = fileToScan || manualFile;
     if (!file) {
       alert("Please select an image first.");
       return;
     }

     setIsAutoFilling(true);
     
     const reader = new FileReader();
     reader.readAsDataURL(file);
     
     reader.onloadend = async () => {
        const base64Image = reader.result;

        try {
           // We keep your existing AI Vision logic here
           const response = await fetch(`${API_URL}/api/vision/read-label`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ image: base64Image })
           });

           const data = await response.json();

           if (response.ok) {
              setRegForm(prev => ({
                 ...prev,
                 manufacturer: data.manufacturer || prev.manufacturer,
                 batchNumber: data.batchNumber || prev.batchNumber,
              }));
           } else {
              alert("Could not read text from image.");
           }
        } catch (error) {
           console.error("Vision API Error", error);
        } finally {
           setIsAutoFilling(false);
        }
     };
  };

  // --- BLOCKCHAIN VERIFICATION (MOBILE FRIENDLY) ---
  const verifyProduct = async (code) => {
    setIsVerifying(true);
    
    try {
      let provider;
      
      // LOGIC: Check if user has a wallet. If not, use a Public "Read-Only" Connection.
      if (window.ethereum) {
          // 1. Desktop with MetaMask (Fastest)
          provider = new ethers.BrowserProvider(window.ethereum);
      } else {
          // 2. Mobile / No Wallet (Public Node)
          // This allows anyone to READ the blockchain for free
         provider = new ethers.JsonRpcProvider("https://1rpc.io/sepolia");
      }

      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

      // Call the Smart Contract function: verifyProduct(qrCodeId)
      const result = await contract.verifyProduct(code);
      
      const isAuthentic = result[3]; 

      if (isAuthentic) {
        setProductData({
          qrCodeId: code,
          productName: result[0],
          manufacturer: result[1],
          batchNumber: result[2],
          isAuthentic: true,
          expiryDate: new Date().toISOString()
        });
        setVerificationResult('success');
      } else {
        setVerificationResult('error');
      }

    } catch (error) {
      console.error("Blockchain Verification failed:", error);
      setVerificationResult('error');
    } finally {
      setIsVerifying(false);
    }
  };
  // --- BLOCKCHAIN REGISTRATION ---
  const handleRegisterSubmit = async () => {
      if (!regForm.productName || !regForm.manufacturer) {
         alert("Please fill in Product Name and Manufacturer.");
         return;
      }
      setIsRegistering(true);

      const newQrCodeId = scannedData || "GLS-" + Math.floor(Math.random() * 10000);

      try {
          if (!window.ethereum) {
            alert("MetaMask is required to register products.");
            setIsRegistering(false);
            return;
          }

          // 1. Connect Wallet (User must approve)
          const provider = new ethers.BrowserProvider(window.ethereum);
          const signer = await provider.getSigner(); // This opens MetaMask popup
          
          const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

          // 2. Write to Blockchain
          console.log("Sending transaction to blockchain...");
          
          // Call: registerProduct(qrCodeId, name, manufacturer, batch)
          const tx = await contract.registerProduct(
            newQrCodeId,
            regForm.productName,
            regForm.manufacturer,
            regForm.batchNumber || "BATCH-001"
          );

          // 3. Wait for confirmation (Green Checkmark)
          await tx.wait();

          alert("Product Registered on Blockchain Successfully!");
          
          // Auto-verify the product we just added
          await verifyProduct(newQrCodeId);
          setShowRegisterModal(false);

      } catch (error) {
          console.error("Registration failed:", error);
          if(error.reason) {
             alert(`Blockchain Error: ${error.reason}`);
          } else {
             alert("Transaction cancelled or failed.");
          }
      } finally {
          setIsRegistering(false);
      }
  };

  const handleScannedCode = (data) => {
    setScannedData(data);
    setCameraActive(false); 
    verifyProduct(data); 
  };

 // --- REAL FILE SCANNING LOGIC ---
  const handleVerifyManual = () => {
     if (manualFile) {
        setIsVerifying(true); // Show loading spinner

        // 1. Create a generic file reader
        const reader = new FileReader();
        
        reader.onload = (e) => {
           // 2. Load the uploaded image into memory
           const image = new Image();
           image.src = e.target.result;

           image.onload = () => {
              // 3. Create a temporary canvas to read the pixels
              const canvas = document.createElement('canvas');
              const context = canvas.getContext('2d');
              canvas.width = image.width;
              canvas.height = image.height;
              context.drawImage(image, 0, 0);

              // 4. Use jsQR to find the code in the pixels
              const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(imageData.data, imageData.width, imageData.height, {
                  inversionAttempts: "dontInvert",
              });

              if (code && code.data) {
                 // SUCCESS: Found a QR Code in the file!
                 setScannedData(code.data);
                 verifyProduct(code.data);
              } else {
                 // FAILURE: No QR Code found
                 alert("Could not find a QR Code in this image. Please upload a clear photo containing a visible QR code.");
                 setIsVerifying(false);
              }
           };
        };
        
        // Start reading the file
        reader.readAsDataURL(manualFile);
     }
  };

  const resetVerification = () => {
    setVerificationResult(null);
    setScannedData(null);
    setProductData(null);
    setManualFile(null);
    setCameraError(null);
    setPermissionDenied(false);
    setCameraActive(true);
    setShowRegisterModal(false);
    setLabelImage(null);
    setRegForm({ productName: '', manufacturer: '', batchNumber: '' });
  };

  const toggleCamera = () => {
    setCameraActive(!cameraActive);
    if (!cameraActive) {
        setScannedData(null);
        setCameraError(null);
    }
  };

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      
      {/* Header */}
      <div className="mb-6 md:mb-8 text-center md:text-left">
        <h2 className="text-2xl md:text-3xl font-bold text-emerald-900 flex items-center justify-center md:justify-start gap-3">
          <ShieldCheck className="text-emerald-600 shrink-0" size={32} />
          {t.verifyHeader} <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full border border-indigo-200">Blockchain Powered</span>
        </h2>
        <p className="text-slate-500 mt-2 text-base md:text-lg max-w-2xl mx-auto md:mx-0">
          {t.verifySub}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 items-start">
        
        {/* --- LEFT COLUMN: QR SCANNER --- */}
        <div className="bg-black/90 rounded-3xl shadow-xl border border-slate-800 overflow-hidden flex flex-col relative h-[450px] md:h-[600px] w-full mx-auto">
          <div className="p-4 md:p-6 border-b border-white/10 flex justify-between items-center bg-black/40 z-20">
            <h3 className="font-semibold text-white flex items-center gap-2 text-sm md:text-base">
              <ScanLine size={18} className="text-lime-400" />
              {t.liveScanner}
            </h3>
            <div className="flex gap-2 items-center">
              {cameraActive && !cameraError && !cameraLoading ? (
                <>
                  <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse"></span>
                  <span className="text-xs font-medium text-slate-300">Live</span>
                </>
              ) : (
                <span className="text-xs font-medium text-slate-500">
                   {cameraLoading ? "Loading..." : "Paused"}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex-1 bg-black relative flex items-center justify-center overflow-hidden">
             <canvas ref={canvasRef} className="hidden" />

             {cameraActive && !scannedData && !cameraError ? (
                <>
                   <video 
                     ref={videoRef}
                     playsInline
                     muted
                     className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${cameraLoading ? 'opacity-0' : 'opacity-100'}`}
                   />
                   {cameraLoading && (
                       <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-slate-900">
                           <Loader2 size={48} className="text-emerald-500 animate-spin mb-4" />
                           <p className="text-white text-sm font-medium">Starting Camera...</p>
                       </div>
                   )}
                   <div className="absolute inset-0 bg-black/50 z-10">
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 md:w-72 md:h-72 border border-white/20 bg-transparent box-content shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]">
                          <div className="absolute top-0 left-0 w-8 h-8 border-l-4 border-t-4 border-lime-400"></div>
                          <div className="absolute top-0 right-0 w-8 h-8 border-r-4 border-t-4 border-lime-400"></div>
                          <div className="absolute bottom-0 left-0 w-8 h-8 border-l-4 border-b-4 border-lime-400"></div>
                          <div className="absolute bottom-0 right-0 w-8 h-8 border-r-4 border-b-4 border-lime-400"></div>
                          {!cameraLoading && (
                             <div className="absolute left-0 right-0 top-0 h-0.5 bg-lime-400 shadow-[0_0_20px_rgba(163,230,53,0.8)] animate-[scan_2s_ease-in-out_infinite]"></div>
                          )}
                          <div className="absolute inset-0 flex items-center justify-center opacity-20">
                              <QrCode size={80} className="text-white" />
                          </div>
                      </div>
                   </div>
                   {!cameraLoading && (
                        <p className="absolute bottom-6 md:bottom-8 text-white text-xs md:text-sm font-medium bg-black/60 px-6 py-2 rounded-full backdrop-blur-md z-20 border border-white/10 shadow-lg text-center max-w-[90%]">
                            {t.alignQr}
                        </p>
                   )}
                </>
             ) : (
               <div className="text-slate-500 flex flex-col items-center p-8 text-center z-10 relative w-full">
                 {isVerifying ? (
                     <div className="flex flex-col items-center">
                         <Loader2 size={48} className="text-indigo-400 animate-spin mb-4" />
                         <p className="text-white font-medium">Connecting to Blockchain...</p>
                         <p className="text-slate-400 text-xs mt-2">Checking Sepolia Network</p>
                     </div>
                 ) : scannedData ? (
                    <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="flex flex-col items-center">
                      <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-emerald-900/90 text-lime-400 flex items-center justify-center mb-6 border-4 border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.4)]">
                        <CheckCircle size={40} />
                      </div>
                      <p className="text-white mb-2 font-bold text-xl md:text-2xl">{t.codeDetected}</p>
                      <div className="bg-white/10 backdrop-blur-md px-6 py-3 rounded-xl border border-white/10 mb-4">
                        <p className="text-sm font-mono text-lime-400 break-all max-w-[250px]">{scannedData}</p>
                      </div>
                    </motion.div>
                 ) : permissionDenied ? (
                   <div className="flex flex-col items-center max-w-xs">
                     <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-red-900/20 flex items-center justify-center mb-4 text-red-400 border border-red-500/30"><Lock size={28} /></div>
                     <h4 className="text-white font-bold text-lg mb-2">Access Denied</h4>
                     <p className="text-slate-400 mb-6 text-sm">Please allow camera access in your browser.</p>
                     <button onClick={resetVerification} className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-500 rounded-xl font-bold transition-colors shadow-lg"><RefreshCw size={18} /> {t.retry}</button>
                   </div>
                 ) : cameraError ? (
                   <div className="flex flex-col items-center">
                     <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-red-900/20 flex items-center justify-center mb-4 text-red-400 border border-red-500/30"><AlertCircle size={28} /></div>
                     <p className="text-red-200 mb-6 max-w-xs font-medium text-sm">{cameraError}</p>
                     <button onClick={resetVerification} className="flex items-center gap-2 px-6 py-3 bg-white/10 text-white border border-white/20 rounded-xl font-bold hover:bg-white/20 transition-colors shadow-lg"><RefreshCw size={18} /> {t.retry}</button>
                   </div>
                 ) : (
                   <>
                     <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-white/5 flex items-center justify-center mb-6 border border-white/10"><Camera size={36} className="text-slate-600" /></div>
                     <p className="text-slate-400 text-base md:text-lg">{t.cameraInactive}</p>
                   </>
                 )}
               </div>
             )}
          </div>
          
          <div className="p-4 bg-black/40 border-t border-white/10 text-center z-20">
            <button onClick={toggleCamera} className={`font-bold text-sm md:text-base py-2 transition-colors uppercase tracking-wider flex items-center justify-center gap-2 w-full rounded-lg ${cameraActive && !scannedData && !permissionDenied ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'}`}>
              {cameraActive && !scannedData && !cameraError && !permissionDenied ? t.pauseCamera : t.activateCamera}
            </button>
          </div>
        </div>

        {/* --- RIGHT COLUMN: RESULTS --- */}
        <div className="flex flex-col gap-4 md:gap-6 relative h-full">
          <AnimatePresence>
            {verificationResult === 'success' && productData && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="absolute inset-0 z-30 bg-white/95 backdrop-blur-xl rounded-3xl border border-emerald-200 flex flex-col items-center justify-center p-6 md:p-8 text-center shadow-2xl min-h-[400px]">
                <div className="absolute inset-0 bg-emerald-50/50 rounded-3xl animate-pulse-slow"></div>
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-20 h-20 md:w-24 md:h-24 bg-gradient-to-br from-emerald-500 to-emerald-700 text-white rounded-full flex items-center justify-center mb-6 shadow-xl shadow-emerald-500/30 relative z-10"><CheckCircle size={48} /></motion.div>
                <h3 className="text-2xl md:text-3xl font-bold text-emerald-900 mb-2 relative z-10">{productData.productName}</h3>
                <p className="text-emerald-600 font-bold mb-4 relative z-10 text-sm">{t.authenticProduct}</p>
                <div className="bg-emerald-50 rounded-xl p-4 md:p-6 mb-6 md:mb-8 w-full max-w-sm border border-emerald-200 relative z-10 shadow-sm text-left">
                   <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-slate-500">Manufacturer:</span><span className="font-bold text-emerald-900">{productData.manufacturer}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Batch No:</span><span className="font-mono text-slate-700">{productData.batchNumber}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Status:</span><span className="font-medium text-emerald-600 flex items-center gap-1"><ShieldCheck size={14}/> Verified on Blockchain</span></div>
                   </div>
                   <div className="h-px bg-emerald-200 w-full my-4"></div>
                   <p className="text-emerald-600 text-xs text-center break-all font-mono">ID: {productData.qrCodeId}</p>
                </div>
                <button onClick={resetVerification} className="relative z-10 px-8 py-3.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg flex items-center gap-2 hover:scale-105 active:scale-95"><ScanLine size={18} /> {t.verifyAnother}</button>
              </motion.div>
            )}

            {verificationResult === 'error' && (
               <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="absolute inset-0 z-30 bg-white/95 backdrop-blur-xl rounded-3xl border border-red-200 flex flex-col items-center justify-center p-6 md:p-8 text-center shadow-2xl min-h-[400px]">
                <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4"><AlertCircle size={40} /></div>
                <h3 className="text-2xl font-bold text-red-900 mb-2">Not Found on Blockchain</h3>
                <p className="text-slate-500 mb-6 max-w-xs">QR code ({scannedData}) is not in the decentralized registry.</p>
                <div className="flex flex-col gap-3 w-full max-w-xs">
                  <button onClick={resetVerification} className="w-full px-6 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors">Try Again</button>
                  <button onClick={() => { setVerificationResult(null); setShowRegisterModal(true); }} className="w-full px-6 py-3 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-xl font-bold hover:bg-indigo-100 transition-colors flex items-center justify-center gap-2"><Plus size={18} /> Register Product</button>
                </div>
             </motion.div>
            )}
          </AnimatePresence>

          {/* REGISTER MODAL (With internal Vision Camera) */}
          <AnimatePresence>
            {showRegisterModal && (
               <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }} className="absolute inset-0 z-40 bg-white rounded-3xl p-6 md:p-8 flex flex-col overflow-y-auto shadow-2xl">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold text-slate-800">Register on Blockchain</h3>
                      <button onClick={() => setShowRegisterModal(false)} className="p-2 bg-slate-100 rounded-full"><XCircle size={20} /></button>
                  </div>
                  <div className="space-y-4 flex-1">
                     <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 mb-4 flex flex-col gap-3">
                        <div className="flex justify-between items-center">
                            <div><h4 className="font-bold text-indigo-900 text-sm">Auto-Fill Details</h4><p className="text-xs text-indigo-700">Take a photo of the label to auto-fill.</p></div>
                            <button onClick={() => labelInputRef.current.click()} disabled={isAutoFilling} className="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg flex items-center gap-2 hover:bg-indigo-700">
                               {isAutoFilling ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                               {isAutoFilling ? "Scanning..." : "Take Photo"}
                            </button>
                        </div>
                        {labelImage && <div className="text-xs text-indigo-600 flex items-center gap-1"><CheckCircle size={12} /> Image selected</div>}
                        <input type="file" ref={labelInputRef} onChange={handleLabelImageSelect} accept="image/*" capture="environment" className="hidden" />
                     </div>

                     <div><label className="text-xs font-bold text-slate-500 uppercase mb-1 block">QR Code ID (Immutable)</label><div className="p-3 bg-slate-100 rounded-xl font-mono text-sm text-slate-600 break-all border border-slate-200">{scannedData || "GENERATED-ON-SUBMIT"}</div></div>
                     <div><label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Product Name</label><input type="text" className="w-full pl-4 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500" placeholder="e.g. GreenLife Seeds" value={regForm.productName} onChange={(e) => setRegForm({...regForm, productName: e.target.value})} /></div>
                     <div><label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Manufacturer</label><input type="text" className="w-full pl-4 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500" placeholder="e.g. GreenLife Ltd" value={regForm.manufacturer} onChange={(e) => setRegForm({...regForm, manufacturer: e.target.value})} /></div>
                     <div><label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Batch No.</label><input type="text" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-emerald-500" placeholder="B-001" value={regForm.batchNumber} onChange={(e) => setRegForm({...regForm, batchNumber: e.target.value})} /></div>
                  </div>
                  <button onClick={handleRegisterSubmit} disabled={isRegistering || !regForm.productName} className={`w-full py-4 mt-6 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all ${isRegistering || !regForm.productName ? 'bg-slate-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 shadow-lg'}`}>
                     {isRegistering ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                     {isRegistering ? "Signing Transaction..." : "Save to Blockchain"}
                  </button>
               </motion.div>
            )}
          </AnimatePresence>

          <div className="bg-emerald-50 rounded-3xl p-5 md:p-6 border border-emerald-200 flex-shrink-0">
             <div className="flex items-start gap-4">
                <div className="p-3 bg-emerald-100 rounded-xl text-emerald-700 shrink-0"><ShieldCheck size={24} /></div>
                <div><h3 className="font-bold text-emerald-900 mb-1">{t.verifyManually}</h3><p className="text-sm text-emerald-800/70 leading-relaxed">{t.verifyManuallyDesc}</p></div>
             </div>
          </div>

          <div className="bg-white rounded-3xl shadow-md shadow-emerald-900/5 border border-slate-200 p-5 md:p-6 flex-1 flex flex-col">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2 text-lg"><Package size={20} className="text-emerald-600" />{t.uploadLabel}</h3>
            <div className="flex-1"><FileUpload label={t.uploadLabel} onFileSelect={setManualFile} /></div>
            <button onClick={handleVerifyManual} disabled={isVerifying || !manualFile} className={`w-full mt-6 py-4 rounded-xl font-bold text-lg transition-all shadow-lg flex items-center justify-center gap-3 border active:scale-95 ${!manualFile ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed' : 'bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-700 shadow-emerald-500/20'}`}>
              {isVerifying ? <><Loader2 size={24} className="animate-spin" />{t.verifying}</> : <><ShieldCheck size={24} />{manualFile ? t.verifyUploaded : t.uploadToVerify}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};