import React, { useState, useCallback } from 'react';
import { Upload, Mail, Check, Copy, Download, Smartphone, Monitor, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { convertFig2Html } from './utils/converter';

const App: React.FC = () => {
  const [htmlInput, setHtmlInput] = useState<string>('');
  const [convertedHtml, setConvertedHtml] = useState<string>('');
  const [isConverting, setIsConverting] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [refImage, setRefImage] = useState<string | null>(null);

  const handleHtmlUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (re) => setHtmlInput(re.target?.result as string);
      reader.readAsText(file);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (re) => setRefImage(re.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleConvert = () => {
    setIsConverting(true);
    // Simulate processing for UX
    setTimeout(() => {
      const result = convertFig2Html(htmlInput);
      setConvertedHtml(result);
      setIsConverting(false);
    }, 800);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(convertedHtml);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const downloadHtml = () => {
    const blob = new Blob([convertedHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'converted_index.html';
    a.click();
  };

  return (
    <div className="min-h-screen bg-[#0a0c10] text-gray-100 font-sans selection:bg-purple-500/30">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
      </div>

      <nav className="relative z-10 border-b border-white/5 bg-black/20 backdrop-blur-md px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg flex items-center justify-center">
            <Mail className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">SkyMail <span className="text-purple-400">Pro</span></span>
        </div>
        <div className="flex items-center gap-6 text-sm text-gray-400">
          <a href="#" className="hover:text-white transition-colors">Documentation</a>
          <a href="#" className="hover:text-white transition-colors">API</a>
          <button className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-full font-medium transition-all shadow-lg shadow-purple-600/20">
            Sign In
          </button>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto px-8 py-12">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <h1 className="text-5xl font-extrabold mb-4 bg-gradient-to-r from-white via-gray-200 to-gray-500 bg-clip-text text-transparent">
            Convert Figma Exports to <br /> Universal Responsive Emails
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Transform absolute-positioned Fig2html code into robust, pixel-perfect, 
            and mobile-stackable email templates with a single click.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <section className="space-y-6">
            <div className="p-1 rounded-2xl bg-gradient-to-br from-white/10 to-transparent shadow-2xl">
              <div className="bg-[#12151c] rounded-xl p-8 space-y-8">
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-purple-400 mb-4 uppercase tracking-widest">
                    <Upload className="w-4 h-4" /> 1. Upload Fig2html
                  </label>
                  <div className="relative group">
                    <input 
                      type="file" 
                      accept=".html" 
                      onChange={handleHtmlUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className="border-2 border-dashed border-white/10 group-hover:border-purple-500/50 rounded-xl p-10 flex flex-col items-center justify-center transition-all bg-white/[0.02] group-hover:bg-purple-500/[0.03]">
                      <Upload className="w-10 h-10 text-gray-500 mb-4 group-hover:text-purple-400 transition-colors" />
                      <p className="text-gray-400 text-center">
                        {htmlInput ? 'File Ready' : 'Drop your index.html here or click to browse'}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-blue-400 mb-4 uppercase tracking-widest">
                    <Monitor className="w-4 h-4" /> 2. Visual Understanding (Optional)
                  </label>
                  <div className="relative group">
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleImageUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className="border-2 border-dashed border-white/10 group-hover:border-blue-500/50 rounded-xl p-6 flex flex-col items-center justify-center transition-all bg-white/[0.02] group-hover:bg-blue-500/[0.03]">
                      {refImage ? (
                        <img src={refImage} className="max-h-32 rounded-lg" alt="Reference" />
                      ) : (
                        <>
                          <Monitor className="w-6 h-6 text-gray-500 mb-2 group-hover:text-blue-400 transition-colors" />
                          <p className="text-xs text-gray-400 font-medium">Add JPG for visual reference</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <button 
                  onClick={handleConvert}
                  disabled={!htmlInput || isConverting}
                  className={`w-full py-4 rounded-xl font-bold text-lg transition-all shadow-xl flex items-center justify-center gap-3 ${
                    !htmlInput 
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed' 
                    : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white shadow-purple-600/20 active:scale-[0.98]'
                  }`}
                >
                  {isConverting ? (
                    <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>Process Conversion <Check className="w-5 h-5" /></>
                  )}
                </button>
              </div>
            </div>

            <div className="bg-blue-900/10 border border-blue-500/20 rounded-xl p-4 flex gap-4">
              <Info className="w-6 h-6 text-blue-400 shrink-0" />
              <p className="text-sm text-blue-100/70">
                <strong>Pro Tip:</strong> Our engine uses pixel-perfect coordinate mapping to ensure every gap matches your original creative exactly.
              </p>
            </div>
          </section>

          <section className="flex flex-col h-full">
            <div className="bg-[#12151c] rounded-2xl flex-1 flex flex-col overflow-hidden border border-white/5 shadow-2xl">
              <div className="bg-black/40 px-6 py-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex bg-white/5 rounded-lg p-1">
                  <button 
                    onClick={() => setPreviewMode('desktop')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2 ${previewMode === 'desktop' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                  >
                    <Monitor className="w-3.5 h-3.5" /> Desktop
                  </button>
                  <button 
                    onClick={() => setPreviewMode('mobile')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-2 ${previewMode === 'mobile' ? 'bg-white/10 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
                  >
                    <Smartphone className="w-3.5 h-3.5" /> Mobile
                  </button>
                </div>
                
                <div className="flex gap-2">
                  <button 
                    onClick={copyToClipboard}
                    disabled={!convertedHtml}
                    className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-all disabled:opacity-50"
                    title="Copy Code"
                  >
                    {copySuccess ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <button 
                    onClick={downloadHtml}
                    disabled={!convertedHtml}
                    className="p-2 bg-purple-600/20 hover:bg-purple-600/30 rounded-lg text-purple-400 hover:text-purple-300 transition-all disabled:opacity-50"
                    title="Download HTML"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 bg-white relative p-4 flex justify-center overflow-auto">
                <AnimatePresence mode="wait">
                  {!convertedHtml ? (
                    <motion.div 
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 p-8 text-center"
                    >
                      <Mail className="w-16 h-16 opacity-5 mb-6" />
                      <p className="max-w-xs">Your converted email preview will appear here in real-time.</p>
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="preview"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="h-full flex justify-center"
                      style={{ width: '100%' }}
                    >
                      <iframe 
                        srcDoc={convertedHtml} 
                        className={`border-0 bg-white transition-all duration-500 shadow-2xl ${
                          previewMode === 'mobile' ? 'w-[375px]' : 'w-full'
                        }`}
                        style={{ height: 'min-content', minHeight: '600px' }}
                        title="Email Preview"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/5 py-12 px-8 text-center">
        <p className="text-gray-500 text-sm">
          &copy; 2026 SkyMail Pro. Built for modern marketing workflows.
        </p>
      </footer>
    </div>
  );
};

export default App;
