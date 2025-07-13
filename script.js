class MusicVisualizer {
    constructor() {
        // Audio context and nodes
        this.showSensitivityMessage = true;

        this.audioContext = null;
        this.analyser = null;
        this.gainNode = null;
        this.mediaElementSource = null;
        
        // Audio sources
        this.audioElement = new Audio();
        this.audioBuffer = null;
        this.mediaStream = null;
        this.bufferSource = null;
        
        // Audio data
        this.dataArray = null;
        
        // Playback state
        this.isPlaying = false;
        this.currentSourceType = null; // 'file', 'mic', or 'sample'
        this.pausedTime = 0;
        this.currentSong = null;
        this.songProgressInterval = null;
        
        // Sample songs
        this.sampleSongs = [
            {
                name: "Desi Kalakaar",
                url: "sample-songs/Desi Kalakaar.mp3",
                artist: "Yo Yo Honey Singh"
            },
            {
                name: "Chaan Botal Vodka",
                url: "sample-songs/Chaar Botal Vodka.mp3",
                artist: "Yo Yo Honey Singh"
            },
            {
                name: "Senorita",
                url: "sample-songs/Senorita.mp3",
                artist: "ZNMD"
            }
        ];
        
        // DOM elements
        this.canvas = document.getElementById('visualizer');
        this.ctx = this.canvas.getContext('2d');
        this.nowPlayingEl = document.getElementById('now-playing');
        this.songProgressEl = document.getElementById('song-progress');
        this.sampleSongsContainer = document.getElementById('sample-songs');
        

        // Initialize
        this.init();
    }
updateSensitivityMessage() {
    const sensitivityValue = parseFloat(document.getElementById('sensitivity').value);
    this.showSensitivityMessage = sensitivityValue === 1; // Show message if sensitivity is at default (1)
}
    init() {
        this.setupEventListeners();
        this.resizeCanvas();
        this.setupAudioContext();
        this.loadSampleSongs();
        this.animate();
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.resizeCanvas());
        
        document.getElementById('audio-upload').addEventListener('change', (e) => this.handleFileUpload(e));
        
        document.getElementById('file-btn').addEventListener('click', () => {
            document.getElementById('audio-upload').click();
            this.setActiveButton('file-btn');
            this.hideSampleSongs();
        });
        
        document.getElementById('mic-btn').addEventListener('click', async () => {
            await this.setActiveButton('mic-btn');
            this.hideSampleSongs();
            this.useMicrophone();
        });
        
        document.getElementById('samples-btn').addEventListener('click', () => {
            this.setActiveButton('samples-btn');
            this.showSampleSongs();
        });
        
        document.getElementById('play-btn').addEventListener('click', () => this.togglePlayback());
        
        document.getElementById('mode-btn').addEventListener('click', () => {
            document.querySelector('.settings-panel').classList.toggle('active');
        });
        
        document.getElementById('fullscreen-btn').addEventListener('click', this.toggleFullscreen.bind(this));
        
        document.getElementById('volume-slider').addEventListener('input', (e) => {
            const volume = parseFloat(e.target.value);
            this.audioElement.volume = volume;
            if (this.gainNode) this.gainNode.gain.value = volume;
        });
        
        document.getElementById('visual-mode').addEventListener('change', (e) => {
            this.visualMode = e.target.value;
            document.getElementById('mode-value').textContent = e.target.selectedOptions[0].text;
        });
        
        document.getElementById('color-scheme').addEventListener('change', (e) => {
            this.colorScheme = e.target.value;
        });
        
  document.getElementById('sensitivity').addEventListener('input', (e) => {
    this.sensitivity = parseFloat(e.target.value);
    this.updateSensitivityMessage();
});
        
        this.audioElement.addEventListener('timeupdate', () => this.updateSongProgress());
        this.audioElement.addEventListener('ended', () => {
            this.isPlaying = false;
            document.getElementById('play-btn').innerHTML = '<i class="fas fa-play"></i>';
            clearInterval(this.songProgressInterval);
        });
    }

    loadSampleSongs() {
        this.sampleSongsContainer.innerHTML = '';
        this.sampleSongs.forEach((song, index) => {
            const songEl = document.createElement('div');
            songEl.className = 'sample-song';
            songEl.innerHTML = `
                <span>${song.name}</span>
                <span>${song.artist}</span>
            `;
            songEl.addEventListener('click', (e) => this.playSampleSong(song, e));
            this.sampleSongsContainer.appendChild(songEl);
        });
    }

    async playSampleSong(song, event) {
        try {
            this.cleanupAudioSources();
            this.updateSensitivityMessage();
            this.currentSourceType = 'sample';
            this.currentSong = song;
            this.isPlaying = false;
            
            // Update UI
            this.nowPlayingEl.textContent = `${song.name} - ${song.artist}`;
            document.querySelectorAll('.sample-song').forEach(el => el.classList.remove('active'));
            event.currentTarget.classList.add('active');
            
            // Set audio source
            this.audioElement.src = song.url;
            
            // Wait for audio to be ready
            await new Promise((resolve) => {
                const onCanPlay = () => {
                    this.audioElement.removeEventListener('canplaythrough', onCanPlay);
                    resolve();
                };
                this.audioElement.addEventListener('canplaythrough', onCanPlay);
                this.audioElement.load();
            });
            
            // Setup audio processing
            await this.setupAudioContext();
            
            if (!this.mediaElementSource) {
                this.mediaElementSource = this.audioContext.createMediaElementSource(this.audioElement);
                this.mediaElementSource.connect(this.analyser);
            }
            
            // Enable play button
            document.getElementById('play-btn').disabled = false;
            
            // Start playback
            await this.startPlayback();
        } catch (err) {
            console.error('Error loading sample song:', err);
            alert('Error loading sample song. Please try another one.');
        }
    }

    showSampleSongs() {
        document.querySelector('.sample-songs').style.display = 'flex';
        document.querySelector('.playback-controls').style.marginTop = '1rem';
    }

    hideSampleSongs() {
        document.querySelector('.sample-songs').style.display = 'none';
        document.querySelector('.playback-controls').style.marginTop = '0';
    }

    updateSongProgress() {
        if (!this.audioElement.duration || isNaN(this.audioElement.duration)) return;
        
        const currentTime = this.formatTime(this.audioElement.currentTime);
        const duration = this.formatTime(this.audioElement.duration);
        this.songProgressEl.textContent = `${currentTime} / ${duration}`;
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    async setupAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = document.getElementById('volume-slider').value;
            
            this.analyser.connect(this.gainNode);
            this.gainNode.connect(this.audioContext.destination);
            
            const bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(bufferLength);
        }
        
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    async useMicrophone() {
            
        try {
            this.cleanupAudioSources();
            this.currentSourceType = 'mic';
            this.pausedTime = 0;
            this.updateSensitivityMessage();
            this.currentSong = null;
            this.nowPlayingEl.textContent = "Microphone Input";
            
            await this.setupAudioContext();
            
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
            this.source.connect(this.analyser);
            
            this.isPlaying = true;
            document.getElementById('play-btn').disabled = false;
            document.getElementById('play-btn').innerHTML = '<i class="fas fa-pause"></i>';
        } catch (err) {
            console.error('Microphone error:', err);
            alert('Could not access microphone. Please ensure you have granted permission.');
        }
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
    this.updateSensitivityMessage();
        this.cleanupAudioSources();
        this.currentSourceType = 'file';
        this.pausedTime = 0;
        this.isPlaying = false;
        this.currentSong = null;
        this.nowPlayingEl.textContent = file.name.replace(/\.[^/.]+$/, ""); // Remove file extension
        document.getElementById('play-btn').innerHTML = '<i class="fas fa-play"></i>';

        const fileReader = new FileReader();
        fileReader.onload = async (e) => {
            try {
                this.audioElement.src = URL.createObjectURL(file);
                this.audioElement.load();
                
                await this.setupAudioContext();
                this.audioBuffer = await this.audioContext.decodeAudioData(e.target.result);
                
                document.getElementById('play-btn').disabled = false;
            } catch (err) {
                console.error('File loading error:', err);
                alert('Error loading audio file. Please try another file.');
            }
        };
        fileReader.readAsArrayBuffer(file);
    }

    async togglePlayback() {
        try {
            await this.setupAudioContext();
            
            if (this.isPlaying) {
                await this.pausePlayback();
            } else {
                await this.startPlayback();
            }
        } catch (err) {
            console.error('Playback error:', err);
            alert('Playback error: ' + err.message);
        }
    }

    async startPlayback() {
        if (this.currentSourceType === 'file' || this.currentSourceType === 'sample') {
            if (!this.audioElement.src) throw new Error('No audio file loaded');
            
            if (!this.mediaElementSource) {
                this.mediaElementSource = this.audioContext.createMediaElementSource(this.audioElement);
                this.mediaElementSource.connect(this.analyser);
            }
            
            if (this.pausedTime) {
                this.audioElement.currentTime = this.pausedTime;
            }
            
            await this.audioElement.play();
            this.startProgressTracking();
        } 
        else if (this.currentSourceType === 'mic') {
            if (!this.source) await this.useMicrophone();
        }
        else {
            throw new Error('No audio source selected');
        }
        
        this.isPlaying = true;
        document.getElementById('play-btn').innerHTML = '<i class="fas fa-pause"></i>';
    }

    startProgressTracking() {
        clearInterval(this.songProgressInterval);
        this.updateSongProgress();
        this.songProgressInterval = setInterval(() => this.updateSongProgress(), 1000);
    }

    async pausePlayback() {
        if ((this.currentSourceType === 'file' || this.currentSourceType === 'sample') && this.audioElement) {
            this.pausedTime = this.audioElement.currentTime;
            this.audioElement.pause();
            clearInterval(this.songProgressInterval);
        } 
        else if (this.currentSourceType === 'mic' && this.source) {
            this.source.disconnect();
            this.source = null;
            if (this.mediaStream) {
                this.mediaStream.getTracks().forEach(track => track.stop());
                this.mediaStream = null;
            }
        }
        
        this.isPlaying = false;
        document.getElementById('play-btn').innerHTML = '<i class="fas fa-play"></i>';
    }

    cleanupAudioSources() {
        // Clean up file playback sources
        if (this.mediaElementSource) {
            this.mediaElementSource.disconnect();
            this.mediaElementSource = null;
        }
        
        if (this.audioElement) {
            this.audioElement.pause();
            this.audioElement.currentTime = 0;
        }
        
        if (this.bufferSource) {
            this.bufferSource.disconnect();
            this.bufferSource = null;
        }
        
        // Clean up microphone sources
        if (this.source) {
            this.source.disconnect();
            this.source = null;
        }
        
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        
        clearInterval(this.songProgressInterval);
    }

    setActiveButton(activeId) {
        document.querySelectorAll('.source-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.getElementById(activeId).classList.add('active');
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error('Fullscreen error:', err);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    }

    // Visualization methods
    drawBars() {
        if (!this.analyser || !this.dataArray) return;
        
        const width = this.canvas.width;
        const height = this.canvas.height;
        const bufferLength = this.analyser.frequencyBinCount;
        
        this.ctx.fillStyle = 'rgba(248, 249, 250, 0.1)';
        this.ctx.fillRect(0, 0, width, height);
        
        const barWidth = (width / bufferLength) * 2.5;
        let x = 0;
        
        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (this.dataArray[i] / 255) * height * this.sensitivity;
            this.ctx.fillStyle = this.getColor(i / bufferLength);
            this.ctx.fillRect(x, height - barHeight, barWidth, barHeight);
            x += barWidth + 1;
        }
    }

    drawWave() {
        if (!this.analyser || !this.dataArray) return;
        
        const width = this.canvas.width;
        const height = this.canvas.height;
        const bufferLength = this.analyser.frequencyBinCount;
        
        this.ctx.fillStyle = 'rgba(248, 249, 250, 0.1)';
        this.ctx.fillRect(0, 0, width, height);
        
        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = this.getColor(0.5);
        this.ctx.beginPath();
        
        const sliceWidth = width / bufferLength;
        let x = 0;
        
        for (let i = 0; i < bufferLength; i++) {
            const v = this.dataArray[i] / 128.0;
            const y = v * height / 2;
            
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
            
            x += sliceWidth;
        }
        
        this.ctx.lineTo(width, height / 2);
        this.ctx.stroke();
    }

    drawCircle() {
        if (!this.analyser || !this.dataArray) return;
        
        const width = this.canvas.width;
        const height = this.canvas.height;
        const bufferLength = this.analyser.frequencyBinCount;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) * 0.3;
        
        this.ctx.fillStyle = 'rgba(248, 249, 250, 0.1)';
        this.ctx.fillRect(0, 0, width, height);
        
        this.ctx.beginPath();
        
        for (let i = 0; i < bufferLength; i++) {
            const angle = (i / bufferLength) * Math.PI * 2;
            const amplitude = this.dataArray[i] / 255 * this.sensitivity;
            const pointRadius = radius * (1 + amplitude * 0.5);
            
            const x = centerX + Math.cos(angle) * pointRadius;
            const y = centerY + Math.sin(angle) * pointRadius;
            
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        
        this.ctx.closePath();
        this.ctx.strokeStyle = this.getColor(0.5);
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }

    drawParticles() {
        if (!this.analyser || !this.dataArray) return;
        
        const width = this.canvas.width;
        const height = this.canvas.height;
        const bufferLength = this.analyser.frequencyBinCount;
        
        this.ctx.fillStyle = 'rgba(248, 249, 250, 0.05)';
        this.ctx.fillRect(0, 0, width, height);
        
        // Create new particles
        if (this.particles.length < 100) {
            for (let i = 0; i < bufferLength; i += 4) {
                if (Math.random() < this.dataArray[i] / 255 * 0.1) {
                    this.particles.push({
                        x: Math.random() * width,
                        y: height + 10,
                        size: Math.random() * 5 + 2,
                        speed: Math.random() * 3 + 1,
                        color: this.getColor(i / bufferLength),
                        frequency: i
                    });
                }
            }
        }
        
        // Update and draw particles
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            p.y -= p.speed;
            p.x += Math.sin(Date.now() / 500 + p.frequency) * 1.5;
            
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            const size = p.size * (this.dataArray[p.frequency] / 255 * this.sensitivity);
            this.ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
            this.ctx.fill();
            
            if (p.y < -p.size || p.x < -p.size || p.x > width + p.size) {
                this.particles.splice(i, 1);
                i--;
            }
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
            if (!this.isPlaying || !this.analyser) {
        // Clear canvas and show sensitivity message when not playing
        this.ctx.fillStyle = 'rgba(248, 249, 250, 0.1)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        if (this.showSensitivityMessage) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.font = '18px Inter';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('PLEASE ADJUST SENSITIVITY TO BEGIN', 
                            this.canvas.width/2, 
                            this.canvas.height/2);
        }
        return;
    }
        if (!this.isPlaying || !this.analyser) return;
        
        this.analyser.getByteFrequencyData(this.dataArray);
        this.updateFrequencyInfo();
        
        switch (this.visualMode) {
            case 'bars': this.drawBars(); break;
            case 'wave': this.drawWave(); break;
            case 'circle': this.drawCircle(); break;
            case 'particles': this.drawParticles(); break;
            default: this.drawBars();
        }
    }

    updateFrequencyInfo() {
        if (!this.isPlaying || !this.analyser || !this.dataArray) return;
        
        this.analyser.getByteFrequencyData(this.dataArray);
        let maxIndex = 0;
        for (let i = 0; i < this.dataArray.length; i++) {
            if (this.dataArray[i] > this.dataArray[maxIndex]) maxIndex = i;
        }
        
        const nyquist = this.audioContext?.sampleRate ? this.audioContext.sampleRate / 2 : 22050;
        const frequency = Math.round(maxIndex / this.dataArray.length * nyquist);
        document.getElementById('freq-value').textContent = `${frequency} Hz`;
    }

    getColor(value, opacity = 1) {
        const hueMap = {
            blue: { base: 210, range: 30 },
            green: { base: 120, range: 40 },
            purple: { base: 270, range: 30 },
            mono: { base: 0, range: 0 }
        };
        
        const scheme = hueMap[this.colorScheme] || hueMap.blue;
        
        if (this.colorScheme === 'mono') {
            const lightness = 30 + value * 40;
            return `hsla(0, 0%, ${lightness}%, ${opacity})`;
        }
        
        const hue = scheme.base + (value * scheme.range - scheme.range/2);
        return `hsla(${hue}, 80%, 60%, ${opacity})`;
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    new MusicVisualizer();
});