/**
 * Deriv Pattern Analyzer with Three.js Visualization
 * Detects chart patterns and provides trading signals
 * Works on 1, 2, and 5-minute timeframes
 */

class PatternAnalyzer {
    constructor() {
        this.patterns = [];
        this.activeTimeframes = [60, 120, 300]; // 1min, 2min, 5min in seconds
        this.candleData = {
            60: [],
            120: [],
            300: []
        };
        this.detectedPatterns = [];
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.patternMeshes = [];
    }

    // Initialize Three.js scene
    initThreeJS(container) {
        const width = container.clientWidth;
        const height = 200;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);

        this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        this.camera.position.z = 50;

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(width, height);
        container.appendChild(this.renderer.domElement);

        // Add ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        // Add directional light
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(0, 1, 1);
        this.scene.add(directionalLight);

        this.animate();
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        
        // Rotate pattern meshes slightly for visual effect
        this.patternMeshes.forEach(mesh => {
            mesh.rotation.y += 0.005;
        });

        this.renderer.render(this.scene, this.camera);
    }

    // Convert timeframe candles from main chart data
    updateCandleData(mainCandles, timeframe) {
        if (!this.activeTimeframes.includes(timeframe)) return;

        this.candleData[timeframe] = mainCandles.slice(-100); // Keep last 100 candles
        this.detectPatterns(timeframe);
    }

    // Pattern Detection Functions
    detectPatterns(timeframe) {
        const candles = this.candleData[timeframe];
        if (candles.length < 20) return;

        const recentCandles = candles.slice(-50);
        
        // Detect various patterns
        this.detectTriangle(recentCandles, timeframe, 'symmetrical');
        this.detectTriangle(recentCandles, timeframe, 'ascending');
        this.detectTriangle(recentCandles, timeframe, 'descending');
        this.detectHeadAndShoulders(recentCandles, timeframe, false);
        this.detectHeadAndShoulders(recentCandles, timeframe, true);
        this.detectDoubleTopBottom(recentCandles, timeframe, 'top');
        this.detectDoubleTopBottom(recentCandles, timeframe, 'bottom');
        this.detectWedge(recentCandles, timeframe, 'rising');
        this.detectWedge(recentCandles, timeframe, 'falling');
        this.detectFlag(recentCandles, timeframe, 'bull');
        this.detectFlag(recentCandles, timeframe, 'bear');
    }

    // Symmetrical Triangle Detection
    detectTriangle(candles, timeframe, type) {
        if (candles.length < 20) return null;

        const highs = candles.map(c => c.h);
        const lows = candles.map(c => c.l);
        
        // Get peaks and troughs
        const peaks = this.findPeaks(highs);
        const troughs = this.findTroughs(lows);

        if (peaks.length < 2 || troughs.length < 2) return null;

        const recentPeaks = peaks.slice(-3);
        const recentTroughs = troughs.slice(-3);

        // Check for converging lines
        const upperSlope = this.calculateSlope(recentPeaks.map((p, i) => [i, highs[p]]));
        const lowerSlope = this.calculateSlope(recentTroughs.map((t, i) => [i, lows[t]]));

        let isPattern = false;
        let bias = 'neutral';

        if (type === 'symmetrical' && upperSlope < -0.001 && lowerSlope > 0.001) {
            isPattern = true;
            bias = this.determineTrendBias(candles);
        } else if (type === 'ascending' && Math.abs(upperSlope) < 0.002 && lowerSlope > 0.001) {
            isPattern = true;
            bias = 'bullish';
        } else if (type === 'descending' && upperSlope < -0.001 && Math.abs(lowerSlope) < 0.002) {
            isPattern = true;
            bias = 'bearish';
        }

        if (isPattern) {
            const currentPrice = candles[candles.length - 1].c;
            const pattern = this.createPatternSignal(
                `${type.charAt(0).toUpperCase() + type.slice(1)} Triangle`,
                bias,
                currentPrice,
                timeframe,
                candles
            );
            this.addPattern(pattern);
        }
    }

    // Head and Shoulders Detection
    detectHeadAndShoulders(candles, timeframe, inverse = false) {
        if (candles.length < 25) return null;

        const prices = inverse ? candles.map(c => c.l) : candles.map(c => c.h);
        const extremes = inverse ? this.findTroughs(prices) : this.findPeaks(prices);

        if (extremes.length < 5) return null;

        const recent = extremes.slice(-5);
        
        // Check for head and shoulders pattern
        if (recent.length === 5) {
            const [ls, lh, head, rh, rs] = recent.map(i => prices[i]);
            
            const leftShoulderValid = Math.abs(ls - lh) < (head - ls) * 0.3;
            const rightShoulderValid = Math.abs(rs - rh) < (head - rs) * 0.3;
            const headHigher = inverse ? 
                (head < ls && head < rs) : 
                (head > ls && head > rs);
            const shouldersLevel = Math.abs(ls - rs) / ls < 0.02;

            if (leftShoulderValid && rightShoulderValid && headHigher && shouldersLevel) {
                const currentPrice = candles[candles.length - 1].c;
                const neckline = (prices[recent[1]] + prices[recent[3]]) / 2;
                
                const pattern = this.createPatternSignal(
                    inverse ? 'Inverse Head and Shoulders' : 'Head and Shoulders',
                    inverse ? 'bullish' : 'bearish',
                    currentPrice,
                    timeframe,
                    candles,
                    neckline
                );
                this.addPattern(pattern);
            }
        }
    }

    // Double Top/Bottom Detection
    detectDoubleTopBottom(candles, timeframe, type) {
        if (candles.length < 20) return null;

        const prices = type === 'top' ? candles.map(c => c.h) : candles.map(c => c.l);
        const extremes = type === 'top' ? this.findPeaks(prices) : this.findTroughs(prices);

        if (extremes.length < 2) return null;

        const recent = extremes.slice(-2);
        const [first, second] = recent.map(i => prices[i]);

        // Check if the two extremes are at similar levels
        const similarity = Math.abs(first - second) / first;
        
        if (similarity < 0.015) { // Within 1.5%
            const currentPrice = candles[candles.length - 1].c;
            const pattern = this.createPatternSignal(
                `Double ${type.charAt(0).toUpperCase() + type.slice(1)}`,
                type === 'top' ? 'bearish' : 'bullish',
                currentPrice,
                timeframe,
                candles
            );
            this.addPattern(pattern);
        }
    }

    // Wedge Detection (Rising/Falling)
    detectWedge(candles, timeframe, type) {
        if (candles.length < 20) return null;

        const highs = candles.map(c => c.h);
        const lows = candles.map(c => c.l);
        
        const peaks = this.findPeaks(highs);
        const troughs = this.findTroughs(lows);

        if (peaks.length < 2 || troughs.length < 2) return null;

        const recentPeaks = peaks.slice(-3);
        const recentTroughs = troughs.slice(-3);

        const upperSlope = this.calculateSlope(recentPeaks.map((p, i) => [i, highs[p]]));
        const lowerSlope = this.calculateSlope(recentTroughs.map((t, i) => [i, lows[t]]));

        let isPattern = false;
        let bias = 'neutral';

        if (type === 'rising' && upperSlope > 0.001 && lowerSlope > 0.001 && lowerSlope > upperSlope) {
            isPattern = true;
            bias = 'bearish';
        } else if (type === 'falling' && upperSlope < -0.001 && lowerSlope < -0.001 && upperSlope < lowerSlope) {
            isPattern = true;
            bias = 'bullish';
        }

        if (isPattern) {
            const currentPrice = candles[candles.length - 1].c;
            const pattern = this.createPatternSignal(
                `${type.charAt(0).toUpperCase() + type.slice(1)} Wedge`,
                bias,
                currentPrice,
                timeframe,
                candles
            );
            this.addPattern(pattern);
        }
    }

    // Flag Detection (Bull/Bear)
    detectFlag(candles, timeframe, type) {
        if (candles.length < 15) return null;

        // Look for sharp move followed by consolidation
        const recent = candles.slice(-15);
        const pole = recent.slice(0, 5);
        const flag = recent.slice(5);

        const poleMove = type === 'bull' ? 
            (pole[4].c - pole[0].o) / pole[0].o :
            (pole[0].o - pole[4].c) / pole[0].o;

        if (poleMove < 0.02) return null; // Need at least 2% move for pole

        // Check for consolidation in flag
        const flagRange = Math.max(...flag.map(c => c.h)) - Math.min(...flag.map(c => c.l));
        const flagAvg = flag.reduce((sum, c) => sum + c.c, 0) / flag.length;
        const consolidation = flagRange / flagAvg;

        if (consolidation < 0.015) { // Tight consolidation
            const currentPrice = candles[candles.length - 1].c;
            const pattern = this.createPatternSignal(
                `${type === 'bull' ? 'Bull' : 'Bear'} Flag`,
                type === 'bull' ? 'bullish' : 'bearish',
                currentPrice,
                timeframe,
                candles
            );
            this.addPattern(pattern);
        }
    }

    // Helper Functions
    findPeaks(prices) {
        const peaks = [];
        for (let i = 2; i < prices.length - 2; i++) {
            if (prices[i] > prices[i - 1] && prices[i] > prices[i - 2] &&
                prices[i] > prices[i + 1] && prices[i] > prices[i + 2]) {
                peaks.push(i);
            }
        }
        return peaks;
    }

    findTroughs(prices) {
        const troughs = [];
        for (let i = 2; i < prices.length - 2; i++) {
            if (prices[i] < prices[i - 1] && prices[i] < prices[i - 2] &&
                prices[i] < prices[i + 1] && prices[i] < prices[i + 2]) {
                troughs.push(i);
            }
        }
        return troughs;
    }

    calculateSlope(points) {
        if (points.length < 2) return 0;
        
        const n = points.length;
        const sumX = points.reduce((sum, p) => sum + p[0], 0);
        const sumY = points.reduce((sum, p) => sum + p[1], 0);
        const sumXY = points.reduce((sum, p) => sum + p[0] * p[1], 0);
        const sumX2 = points.reduce((sum, p) => sum + p[0] * p[0], 0);

        return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    }

    determineTrendBias(candles) {
        const recent = candles.slice(-20);
        const startPrice = recent[0].o;
        const endPrice = recent[recent.length - 1].c;
        
        return endPrice > startPrice ? 'bullish' : 'bearish';
    }

    createPatternSignal(patternName, bias, currentPrice, timeframe, candles, supportResistance = null) {
        // Calculate entry, TP, and SL
        const atr = this.calculateATR(candles.slice(-14));
        const volatility = atr / currentPrice;

        let entry, tp, sl;

        if (bias === 'bullish') {
            entry = currentPrice * 1.001; // Slight breakout
            tp = entry + (atr * 2);
            sl = entry - (atr * 1);
        } else if (bias === 'bearish') {
            entry = currentPrice * 0.999; // Slight breakdown
            tp = entry - (atr * 2);
            sl = entry + (atr * 1);
        } else {
            entry = currentPrice;
            tp = currentPrice + (atr * 1.5);
            sl = currentPrice - (atr * 1.5);
        }

        return {
            id: Date.now() + Math.random(),
            name: patternName,
            bias: bias,
            timeframe: timeframe,
            entry: entry.toFixed(2),
            tp: tp.toFixed(2),
            sl: sl.toFixed(2),
            currentPrice: currentPrice.toFixed(2),
            confidence: this.calculateConfidence(candles, bias),
            timestamp: Date.now(),
            supportResistance: supportResistance
        };
    }

    calculateATR(candles, period = 14) {
        if (candles.length < period) return 0;

        const trs = [];
        for (let i = 1; i < candles.length; i++) {
            const tr = Math.max(
                candles[i].h - candles[i].l,
                Math.abs(candles[i].h - candles[i - 1].c),
                Math.abs(candles[i].l - candles[i - 1].c)
            );
            trs.push(tr);
        }

        return trs.slice(-period).reduce((sum, tr) => sum + tr, 0) / period;
    }

    calculateConfidence(candles, bias) {
        // Simple confidence calculation based on trend strength
        const recent = candles.slice(-10);
        let confirming = 0;

        for (let i = 1; i < recent.length; i++) {
            if (bias === 'bullish' && recent[i].c > recent[i - 1].c) confirming++;
            if (bias === 'bearish' && recent[i].c < recent[i - 1].c) confirming++;
        }

        return Math.round((confirming / (recent.length - 1)) * 100);
    }

    addPattern(pattern) {
        // Check if similar pattern already exists (within last 5 minutes)
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        const existing = this.detectedPatterns.find(p => 
            p.name === pattern.name && 
            p.timeframe === pattern.timeframe && 
            p.timestamp > fiveMinutesAgo
        );

        if (!existing) {
            this.detectedPatterns.unshift(pattern);
            this.detectedPatterns = this.detectedPatterns.slice(0, 10); // Keep last 10
            this.visualizePattern(pattern);
            this.notifyPattern(pattern);
        }
    }

    visualizePattern(pattern) {
        // Create 3D visualization of pattern
        const geometry = new THREE.IcosahedronGeometry(5, 0);
        
        let color;
        switch (pattern.bias) {
            case 'bullish':
                color = 0x10b981;
                break;
            case 'bearish':
                color = 0xef4444;
                break;
            default:
                color = 0xfbbf24;
        }

        const material = new THREE.MeshPhongMaterial({ 
            color: color,
            emissive: color,
            emissiveIntensity: 0.3,
            transparent: true,
            opacity: 0.8
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(
            (Math.random() - 0.5) * 40,
            (Math.random() - 0.5) * 20,
            (Math.random() - 0.5) * 20
        );

        this.scene.add(mesh);
        this.patternMeshes.push(mesh);

        // Remove after 10 seconds
        setTimeout(() => {
            this.scene.remove(mesh);
            this.patternMeshes = this.patternMeshes.filter(m => m !== mesh);
        }, 10000);
    }

    notifyPattern(pattern) {
        // This will be called by the main HTML to update UI
        if (window.onPatternDetected) {
            window.onPatternDetected(pattern);
        }
    }

    getDetectedPatterns() {
        return this.detectedPatterns;
    }

    clearOldPatterns() {
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        this.detectedPatterns = this.detectedPatterns.filter(p => p.timestamp > oneHourAgo);
    }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PatternAnalyzer;
}
