import { useState } from "react";
import reactLogo from "./assets/react.svg";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  const [greetMsg, setGreetMsg] = useState("");
  const [name, setName] = useState("");
  const [activeSection, setActiveSection] = useState("home");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processResult, setProcessResult] = useState<string | null>(null);

  async function greet() {
    // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
    setGreetMsg(await invoke("greet", { name }));
  }

  const handleFileSelect = (files: FileList | null) => {
    if (files && files.length > 0) {
      const file = files[0];
      const validTypes = ['video/', 'audio/'];
      if (validTypes.some(type => file.type.startsWith(type))) {
        setSelectedFile(file);
        setProcessResult(null); // 清除之前的处理结果
      } else {
        alert('请选择视频或音频文件');
      }
    }
  };

  const processMediaFile = async () => {
    if (!selectedFile) return;
    
    setIsProcessing(true);
    setProcessResult(null);
    
    try {
      // 读取文件内容为字节数组
      const fileBuffer = await selectedFile.arrayBuffer();
      const fileData = Array.from(new Uint8Array(fileBuffer));
      
      const result = await invoke('process_media_file', {
        fileData: fileData,
        fileName: selectedFile.name
      });
      
      console.log('处理结果:', result);
      setProcessResult(`处理成功！输出文件：${(result as any).output_path}`);
    } catch (error) {
      console.error('处理失败:', error);
      setProcessResult(`处理失败：${error}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const renderMainContent = () => {
    switch (activeSection) {
      case "home":
        return (
          <div className="home-content">
            <h1>Murmur - 媒体文件处理器</h1>
            <p className="subtitle">拖拽或选择视频/音频文件开始处理</p>
            
            <div 
              className={`file-drop-zone ${isDragging ? 'dragging' : ''} ${selectedFile ? 'has-file' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {!selectedFile ? (
                <>
                  <div className="drop-icon">📁</div>
                  <p className="drop-text">
                    将视频或音频文件拖拽到此处
                  </p>
                  <p className="drop-subtext">或者</p>
                  <label className="file-select-button">
                    <input 
                      type="file" 
                      accept="video/*,audio/*" 
                      onChange={handleFileInputChange}
                      style={{ display: 'none' }}
                    />
                    选择文件
                  </label>
                </>
              ) : (
                <div className="file-info">
                  <div className="file-icon">
                    {selectedFile.type.startsWith('video/') ? '🎬' : '🎵'}
                  </div>
                  <div className="file-details">
                    <h3>{selectedFile.name}</h3>
                    <p>大小: {formatFileSize(selectedFile.size)}</p>
                    <p>类型: {selectedFile.type}</p>
                  </div>
                  <div className="file-actions">
                    <button 
                      className="process-button"
                      onClick={processMediaFile}
                      disabled={isProcessing}
                    >
                      {isProcessing ? '处理中...' : '开始处理'}
                    </button>
                    <button 
                      className="clear-button"
                      onClick={() => {
                        setSelectedFile(null);
                        setProcessResult(null);
                      }}
                      disabled={isProcessing}
                    >
                      清除文件
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            {processResult && (
              <div className={`process-result ${processResult.includes('成功') ? 'success' : 'error'}`}>
                {processResult}
              </div>
            )}
            
            <div className="supported-formats">
              <h3>支持的格式</h3>
              <div className="format-list">
                <div className="format-group">
                  <strong>视频:</strong> MP4, AVI, MOV, MKV, WebM
                </div>
                <div className="format-group">
                  <strong>音频:</strong> MP3, WAV, AAC, FLAC, OGG
                </div>
              </div>
            </div>
          </div>
        );
      case "greet":
        return (
          <div className="greet-content">
            <h2>Greeting Section</h2>
            <form
              className="greet-form"
              onSubmit={(e) => {
                e.preventDefault();
                greet();
              }}
            >
              <input
                id="greet-input"
                onChange={(e) => setName(e.currentTarget.value)}
                placeholder="Enter a name..."
              />
              <button type="submit">Greet</button>
            </form>
            {greetMsg && <p className="greet-message">{greetMsg}</p>}
          </div>
        );
      case "about":
        return (
          <div className="about-content">
            <h2>About</h2>
            <p>This is a Tauri + React desktop application template.</p>
            <p>It demonstrates how to create a modern cross-platform desktop app.</p>
          </div>
        );
      case "settings":
        return (
          <div className="settings-content">
            <h2>Settings</h2>
            <p>Configure your application settings here.</p>
            <div className="settings-options">
              <label>
                <input type="checkbox" />
                Enable dark mode
              </label>
              <label>
                <input type="checkbox" />
                Auto-start on login
              </label>
            </div>
          </div>
        );
      default:
        return <div>Select a section from the sidebar</div>;
    }
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h3>Murmur</h3>
        </div>
        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeSection === "home" ? "active" : ""}`}
            onClick={() => setActiveSection("home")}
          >
            <span>🏠</span>
            Home
          </button>
          <button
            className={`nav-item ${activeSection === "greet" ? "active" : ""}`}
            onClick={() => setActiveSection("greet")}
          >
            <span>👋</span>
            Greet
          </button>
          <button
            className={`nav-item ${activeSection === "about" ? "active" : ""}`}
            onClick={() => setActiveSection("about")}
          >
            <span>ℹ️</span>
            About
          </button>
          <button
            className={`nav-item ${activeSection === "settings" ? "active" : ""}`}
            onClick={() => setActiveSection("settings")}
          >
            <span>⚙️</span>
            Settings
          </button>
        </nav>
      </aside>
      <main className="main-content">
        {renderMainContent()}
      </main>
    </div>
  );
}

export default App;
