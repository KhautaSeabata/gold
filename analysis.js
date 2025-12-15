// SMC MT5 Deriv Analyzer - Analysis Engine
const FIREBASE_URL = 'https://alerts-83c9b-default-rtdb.firebaseio.com';

let charts = {};
let currentChartView = 1;
let numActiveCharts = 4;
let analysisEnabled = true;
let allSignals = [];
let signalFilter = 'all';

// Symbol name mapping
const SYMBOL_NAMES = {
    'R_10': 'Volatility 10 Index',
    'R_25': 'Volatility 25 Index',
    'R_50': 'Volatility 50 Index',
    'R_75': 'Volatility 75 Index',
    'R_100': 'Volatility 100 Index',
    '1HZ10V': 'Volatility 10 (1s) Index',
    '1HZ25V': 'Volatility 25 (1s) Index',
    '1HZ50V': 'Volatility 50 (1s) Index',
    '1HZ75V': 'Volatility 75 (1s) Index',
    '1HZ100V': 'Volatility 100 (1s) Index',
    '1HZ150V': 'Volatility 150 (1s) Index',
    '1HZ200V': 'Volatility 200 (1s) Index',
    '1HZ300V': 'Volatility 300 (1s) Index',
    'COM_XAUUSD': 'GOLD'
};

class ChartManager {
    constructor(id) {
        this.id = id;
        this.canvas = document.getElementById(`canvas${id}`);
        this.ctx = this.canvas.getContext('2d');
        this.data = [];
        this.ws = null;
        this.symbol = document.getElementById(`symbol${id}`).value;
        this.timeframe = parseInt(document.getElementById(`timeframe${id}`).value);
        this.zoom = 80;
        this.offset = 0;
        this.dragging = false;
        this.autoScroll = true;
        this.smcData = {
            orderBlocks: [],
            fvgs: [],
            liquidityZones: [],
            bos: [],
            choch: [],
            swingPoints: []
        };
        
        this.resizeCanvas();
        this.setupDrag();
    }

    resizeCanvas() {
        const container = this.canvas.parentElement;
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
    }

    setupDrag() {
        let startX, startOffset;
        this.canvas.addEventListener('touchstart', (e) => {
            this.dragging = true;
            startX = e.touches[0].clientX;
            startOffset = this.offset;
            this.autoScroll = false;
        });
        this.canvas.addEventListener('touchmove', (e) => {
            if (!this.dragging) return;
            const deltaX = e.touches[0].clientX - startX;
            const candlesPerScreen = Math.floor(this.zoom);
            const pixelsPerCandle = this.canvas.width / candlesPerScreen;
            const candlesDelta = Math.round(deltaX / pixelsPerCandle);
            this.offset = Math.max(0, Math.min(this.data.length - candlesPerScreen, startOffset - candlesDelta));
            this.draw();
        });
        this.canvas.addEventListener('touchend', () => {
            this.dragging = false;
            if (this.offset >= this.data.length - this.zoom - 5) {
                this.autoScroll = true;
            }
        });
    }

    connect() {
        if (this.ws) this.ws.close();
        
        this.ws = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=1089');
        
        this.ws.onopen = () => {
            updateConnectionStatus(true);
            this.ws.send(JSON.stringify({ ticks: this.symbol, subscribe: 1 }));
            this.ws.send(JSON.stringify({
                ticks_history: this.symbol,
                count: 1000,
                end: 'latest',
                style: 'candles',
                granularity: this.timeframe
            }));
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.candles) {
                this.data = data.candles.map(c => ({
                    x: c.epoch * 1000,
                    o: parseFloat(c.open),
                    h: parseFloat(c.high),
                    l: parseFloat(c.low),
                    c: parseFloat(c.close)
                }));
                this.draw();
                this.updateInfo();
                if (analysisEnabled) this.analyzeSMC();
            } else if (data.tick) {
                this.updateTick(parseFloat(data.tick.quote), data.tick.epoch * 1000);
            }
        };

        this.ws.onerror = () => updateConnectionStatus(false);
        this.ws.onclose = () => updateConnectionStatus(false);
    }

    updateTick(price, time) {
        const candleStart = Math.floor(time / (this.timeframe * 1000)) * (this.timeframe * 1000);
        
        if (!this.data.length || candleStart > this.data[this.data.length - 1].x) {
            this.data.push({ x: candleStart, o: price, h: price, l: price, c: price });
            if (this.data.length > 1000) this.data.shift();
            if (analysisEnabled) this.analyzeSMC();
        } else {
            const last = this.data[this.data.length - 1];
            last.c = price;
            last.h = Math.max(last.h, price);
            last.l = Math.min(last.l, price);
        }
        
        this.draw();
        this.updateInfo();
    }

    // ============ SMC ANALYSIS METHODS ============
    
    analyzeSMC() {
        if (this.data.length < 50) return;
        
        // Reset SMC data
        this.smcData = {
            orderBlocks: [],
            fvgs: [],
            liquidityZones: [],
            bos: [],
            choch: [],
            swingPoints: []
        };
        
        // Identify swing points
        this.identifySwingPoints();
        
        // Detect Order Blocks
        this.detectOrderBlocks();
        
        // Detect Fair Value Gaps
        this.detectFairValueGaps();
        
        // Detect Liquidity Zones
        this.detectLiquidityZones();
        
        // Detect BOS (Break of Structure)
        this.detectBreakOfStructure();
        
        // Detect CHoCH (Change of Character)
        this.detectChangeOfCharacter();
        
        this.draw();
    }

    identifySwingPoints() {
        const lookback = 5;
        
        for (let i = lookback; i < this.data.length - lookback; i++) {
            // Swing High
            let isSwingHigh = true;
            for (let j = 1; j <= lookback; j++) {
                if (this.data[i].h <= this.data[i - j].h || this.data[i].h <= this.data[i + j].h) {
                    isSwingHigh = false;
                    break;
                }
            }
            
            if (isSwingHigh) {
                this.smcData.swingPoints.push({
                    index: i,
                    type: 'high',
                    price: this.data[i].h,
                    time: this.data[i].x
                });
            }
            
            // Swing Low
            let isSwingLow = true;
            for (let j = 1; j <= lookback; j++) {
                if (this.data[i].l >= this.data[i - j].l || this.data[i].l >= this.data[i + j].l) {
                    isSwingLow = false;
                    break;
                }
            }
            
            if (isSwingLow) {
                this.smcData.swingPoints.push({
                    index: i,
                    type: 'low',
                    price: this.data[i].l,
                    time: this.data[i].x
                });
            }
        }
    }

    detectOrderBlocks() {
        for (let i = 3; i < this.data.length - 1; i++) {
            const current = this.data[i];
            const prev = this.data[i - 1];
            const prev2 = this.data[i - 2];
            const next = this.data[i + 1];
            
            // Bullish Order Block - last bearish candle before strong bullish move
            if (prev.c < prev.o && current.c > current.o && (current.c - current.o) > (prev.o - prev.c) * 1.5) {
                this.smcData.orderBlocks.push({
                    type: 'bullish',
                    index: i - 1,
                    top: prev.o,
                    bottom: prev.c,
                    time: prev.x,
                    strength: this.calculateOrderBlockStrength(i - 1, 'bullish')
                });
                
                // Generate signal for bullish OB
                if (this.isRecentOrderBlock(i - 1) && current.l <= prev.o) {
                    this.generateSignal('Bullish Order Block', 'bullish', prev.c, prev.o);
                }
            }
            
            // Bearish Order Block - last bullish candle before strong bearish move
            if (prev.c > prev.o && current.c < current.o && (current.o - current.c) > (prev.c - prev.o) * 1.5) {
                this.smcData.orderBlocks.push({
                    type: 'bearish',
                    index: i - 1,
                    top: prev.c,
                    bottom: prev.o,
                    time: prev.x,
                    strength: this.calculateOrderBlockStrength(i - 1, 'bearish')
                });
                
                // Generate signal for bearish OB
                if (this.isRecentOrderBlock(i - 1) && current.h >= prev.o) {
                    this.generateSignal('Bearish Order Block', 'bearish', prev.c, prev.o);
                }
            }
        }
    }

    detectFairValueGaps() {
        for (let i = 2; i < this.data.length; i++) {
            const current = this.data[i];
            const prev = this.data[i - 1];
            const prev2 = this.data[i - 2];
            
            // Bullish FVG - gap between prev2.high and current.low
            if (current.l > prev2.h && prev.c > prev.o) {
                const gapSize = current.l - prev2.h;
                const avgCandle = (prev.h - prev.l);
                
                if (gapSize > avgCandle * 0.3) {
                    this.smcData.fvgs.push({
                        type: 'bullish',
                        index: i - 1,
                        top: current.l,
                        bottom: prev2.h,
                        time: prev.x,
                        filled: false
                    });
                    
                    if (this.isRecentFVG(i - 1)) {
                        this.generateSignal('Bullish FVG', 'bullish', prev2.h, current.l);
                    }
                }
            }
            
            // Bearish FVG - gap between prev2.low and current.high
            if (current.h < prev2.l && prev.c < prev.o) {
                const gapSize = prev2.l - current.h;
                const avgCandle = (prev.h - prev.l);
                
                if (gapSize > avgCandle * 0.3) {
                    this.smcData.fvgs.push({
                        type: 'bearish',
                        index: i - 1,
                        top: prev2.l,
                        bottom: current.h,
                        time: prev.x,
                        filled: false
                    });
                    
                    if (this.isRecentFVG(i - 1)) {
                        this.generateSignal('Bearish FVG', 'bearish', current.h, prev2.l);
                    }
                }
            }
        }
    }

    detectLiquidityZones() {
        const swingHighs = this.smcData.swingPoints.filter(s => s.type === 'high');
        const swingLows = this.smcData.swingPoints.filter(s => s.type === 'low');
        
        // Equal Highs (Sell-Side Liquidity)
        for (let i = 0; i < swingHighs.length - 1; i++) {
            for (let j = i + 1; j < swingHighs.length; j++) {
                const priceDiff = Math.abs(swingHighs[i].price - swingHighs[j].price);
                const avgPrice = (swingHighs[i].price + swingHighs[j].price) / 2;
                
                if (priceDiff / avgPrice < 0.005) { // Within 0.5%
                    this.smcData.liquidityZones.push({
                        type: 'equal_highs',
                        price: avgPrice,
                        indices: [swingHighs[i].index, swingHighs[j].index],
                        bias: 'bearish'
                    });
                }
            }
        }
        
        // Equal Lows (Buy-Side Liquidity)
        for (let i = 0; i < swingLows.length - 1; i++) {
            for (let j = i + 1; j < swingLows.length; j++) {
                const priceDiff = Math.abs(swingLows[i].price - swingLows[j].price);
                const avgPrice = (swingLows[i].price + swingLows[j].price) / 2;
                
                if (priceDiff / avgPrice < 0.005) {
                    this.smcData.liquidityZones.push({
                        type: 'equal_lows',
                        price: avgPrice,
                        indices: [swingLows[i].index, swingLows[j].index],
                        bias: 'bullish'
                    });
                }
            }
        }
    }

    detectBreakOfStructure() {
        const swingHighs = this.smcData.swingPoints.filter(s => s.type === 'high').slice(-10);
        const swingLows = this.smcData.swingPoints.filter(s => s.type === 'low').slice(-10);
        
        // Bullish BOS - price breaks above previous swing high
        for (let i = 1; i < swingHighs.length; i++) {
            const currentHigh = swingHighs[i];
            const prevHigh = swingHighs[i - 1];
            
            if (currentHigh.price > prevHigh.price) {
                this.smcData.bos.push({
                    type: 'bullish',
                    index: currentHigh.index,
                    breakPrice: prevHigh.price,
                    newPrice: currentHigh.price
                });
                
                if (this.isRecentBOS(currentHigh.index)) {
                    this.generateSignal('Bullish BOS', 'bullish', prevHigh.price, currentHigh.price);
                }
            }
        }
        
        // Bearish BOS - price breaks below previous swing low
        for (let i = 1; i < swingLows.length; i++) {
            const currentLow = swingLows[i];
            const prevLow = swingLows[i - 1];
            
            if (currentLow.price < prevLow.price) {
                this.smcData.bos.push({
                    type: 'bearish',
                    index: currentLow.index,
                    breakPrice: prevLow.price,
                    newPrice: currentLow.price
                });
                
                if (this.isRecentBOS(currentLow.index)) {
                    this.generateSignal('Bearish BOS', 'bearish', currentLow.price, prevLow.price);
                }
            }
        }
    }

    detectChangeOfCharacter() {
        const swingPoints = [...this.smcData.swingPoints].sort((a, b) => a.index - b.index).slice(-20);
        
        for (let i = 2; i < swingPoints.length; i++) {
            const current = swingPoints[i];
            const prev = swingPoints[i - 1];
            const prev2 = swingPoints[i - 2];
            
            // Bullish CHoCH - downtrend reversal
            if (prev2.type === 'high' && prev.type === 'low' && current.type === 'high') {
                if (current.price > prev2.price && prev.price < prev2.price) {
                    this.smcData.choch.push({
                        type: 'bullish',
                        index: current.index,
                        reversal: prev.price
                    });
                    
                    if (this.isRecentCHoCH(current.index)) {
                        this.generateSignal('Bullish CHoCH', 'bullish', prev.price, current.price);
                    }
                }
            }
            
            // Bearish CHoCH - uptrend reversal
            if (prev2.type === 'low' && prev.type === 'high' && current.type === 'low') {
                if (current.price < prev2.price && prev.price > prev2.price) {
                    this.smcData.choch.push({
                        type: 'bearish',
                        index: current.index,
                        reversal: prev.price
                    });
                    
                    if (this.isRecentCHoCH(current.index)) {
                        this.generateSignal('Bearish CHoCH', 'bearish', prev.price, current.price);
                    }
                }
            }
        }
    }

    // Helper methods
    calculateOrderBlockStrength(index, type) {
        const candle = this.data[index];
        const range = candle.h - candle.l;
        const volume = Math.abs(candle.c - candle.o);
        return Math.min(100, Math.round((volume / range) * 100));
    }

    isRecentOrderBlock(index) {
        return this.data.length - index <= 5;
    }

    isRecentFVG(index) {
        return this.data.length - index <= 3;
    }

    isRecentBOS(index) {
        return this.data.length - index <= 5;
    }

    isRecentCHoCH(index) {
        return this.data.length - index <= 5;
    }

    generateSignal(patternName, bias, entry, target) {
        const currentPrice = this.data[this.data.length - 1].c;
        const symbolName = SYMBOL_NAMES[this.symbol] || this.symbol;
        
        let entryPrice, tp1, tp2, tp3, sl;
        const pipValue = currentPrice * 0.001;
        
        if (bias === 'bullish') {
            entryPrice = typeof entry === 'number' ? entry : currentPrice * 1.0001;
            tp1 = entryPrice + (10 * pipValue);
            tp2 = entryPrice + (20 * pipValue);
            tp3 = entryPrice + (30 * pipValue);
            sl = entryPrice - (15 * pipValue);
        } else {
            entryPrice = typeof entry === 'number' ? entry : currentPrice * 0.9999;
            tp1 = entryPrice - (10 * pipValue);
            tp2 = entryPrice - (20 * pipValue);
            tp3 = entryPrice - (30 * pipValue);
            sl = entryPrice + (15 * pipValue);
        }
        
        const signal = {
            id: Date.now() + Math.random(),
            chartId: this.id,
            symbol: symbolName,
            name: patternName,
            bias: bias,
            timeframe: this.timeframe,
            entry: entryPrice.toFixed(5),
            tp1: tp1.toFixed(5),
            tp2: tp2.toFixed(5),
            tp3: tp3.toFixed(5),
            sl: sl.toFixed(5),
            confidence: this.calculateConfidence(bias),
            timestamp: Date.now()
        };
        
        addSignal(signal);
    }

    calculateConfidence(bias) {
        let confidence = 50;
        
        // Add confidence based on multiple confirmations
        if (this.smcData.orderBlocks.length > 0) confidence += 15;
        if (this.smcData.fvgs.length > 0) confidence += 10;
        if (this.smcData.bos.length > 0) confidence += 15;
        if (this.smcData.choch.length > 0) confidence += 10;
        
        return Math.min(100, confidence);
    }

    // ============ DRAWING METHODS ============
    
    draw() {
        if (!this.data.length) return;
        
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        const padding = { top: 20, right: 10, bottom: 20, left: 50 };
        const chartW = this.canvas.width - padding.left - padding.right;
        const chartH = this.canvas.height - padding.top - padding.bottom;
        
        const candlesPerScreen = Math.floor(this.zoom);
        if (this.autoScroll) {
            this.offset = Math.max(0, this.data.length - candlesPerScreen);
        }
        
        const visible = this.data.slice(this.offset, this.offset + candlesPerScreen);
        if (!visible.length) return;
        
        const prices = visible.flatMap(c => [c.h, c.l]);
        const maxP = Math.max(...prices);
        const minP = Math.min(...prices);
        const range = maxP - minP;
        const pad = range * 0.1;
        
        const candleW = Math.max(2, Math.min(12, chartW / visible.length - 2));
        const spacing = chartW / visible.length;
        
        const priceToY = (price) => {
            return padding.top + ((maxP + pad - price) / (range + pad * 2)) * chartH;
        };
        
        const indexToX = (idx) => {
            const visibleIdx = idx - this.offset;
            return padding.left + spacing * visibleIdx + spacing / 2;
        };
        
        // Draw grid
        this.drawGrid(padding, chartH, maxP, minP, range, pad);
        
        // Draw SMC elements if analysis is enabled
        if (analysisEnabled) {
            this.drawSMCElements(priceToY, indexToX);
        }
        
        // Draw candles
        this.drawCandles(visible, spacing, padding, priceToY, candleW);
        
        // Draw SMC overlay info
        if (analysisEnabled) {
            this.drawSMCOverlay(padding);
        }
    }

    drawGrid(padding, chartH, maxP, minP, range, pad) {
        this.ctx.strokeStyle = '#2C2C2E';
        this.ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding.top + (chartH / 4) * i;
            this.ctx.beginPath();
            this.ctx.moveTo(padding.left, y);
            this.ctx.lineTo(this.canvas.width - padding.right, y);
            this.ctx.stroke();
            
            const price = maxP + pad - (range + pad * 2) * (i / 4);
            this.ctx.fillStyle = '#8E8E93';
            this.ctx.font = '10px Arial';
            this.ctx.textAlign = 'right';
            this.ctx.fillText(price.toFixed(2), padding.left - 5, y + 3);
        }
    }

    drawSMCElements(priceToY, indexToX) {
        // Draw Order Blocks
        this.smcData.orderBlocks.slice(-10).forEach(ob => {
            if (ob.index >= this.offset && ob.index < this.offset + this.zoom) {
                this.ctx.save();
                this.ctx.fillStyle = ob.type === 'bullish' ? 'rgba(48, 209, 88, 0.2)' : 'rgba(255, 69, 58, 0.2)';
                this.ctx.strokeStyle = ob.type === 'bullish' ? '#30D158' : '#FF453A';
                this.ctx.lineWidth = 2;
                
                const x = indexToX(ob.index);
                const y1 = priceToY(ob.top);
                const y2 = priceToY(ob.bottom);
                const width = this.canvas.width - x - 10;
                
                this.ctx.fillRect(x, y1, width, y2 - y1);
                this.ctx.strokeRect(x, y1, width, y2 - y1);
                
                this.ctx.fillStyle = ob.type === 'bullish' ? '#30D158' : '#FF453A';
                this.ctx.font = 'bold 9px Arial';
                this.ctx.fillText('OB', x + 5, y1 + 12);
                this.ctx.restore();
            }
        });
        
        // Draw Fair Value Gaps
        this.smcData.fvgs.slice(-10).forEach(fvg => {
            if (fvg.index >= this.offset && fvg.index < this.offset + this.zoom && !fvg.filled) {
                this.ctx.save();
                this.ctx.fillStyle = fvg.type === 'bullish' ? 'rgba(0, 122, 255, 0.15)' : 'rgba(255, 159, 10, 0.15)';
                this.ctx.strokeStyle = fvg.type === 'bullish' ? '#007AFF' : '#FF9F0A';
                this.ctx.lineWidth = 1;
                this.ctx.setLineDash([4, 4]);
                
                const x = indexToX(fvg.index);
                const y1 = priceToY(fvg.top);
                const y2 = priceToY(fvg.bottom);
                const width = this.canvas.width - x - 10;
                
                this.ctx.fillRect(x, y1, width, y2 - y1);
                this.ctx.strokeRect(x, y1, width, y2 - y1);
                
                this.ctx.fillStyle = fvg.type === 'bullish' ? '#007AFF' : '#FF9F0A';
                this.ctx.font = 'bold 9px Arial';
                this.ctx.setLineDash([]);
                this.ctx.fillText('FVG', x + 5, y1 + 12);
                this.ctx.restore();
            }
        });
        
        // Draw Liquidity Zones
        this.smcData.liquidityZones.slice(-5).forEach(lz => {
            this.ctx.save();
            this.ctx.strokeStyle = lz.bias === 'bullish' ? '#30D158' : '#FF453A';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([8, 4]);
            
            const y = priceToY(lz.price);
            this.ctx.beginPath();
            this.ctx.moveTo(50, y);
            this.ctx.lineTo(this.canvas.width - 10, y);
            this.ctx.stroke();
            
            this.ctx.fillStyle = lz.bias === 'bullish' ? '#30D158' : '#FF453A';
            this.ctx.font = 'bold 9px Arial';
            this.ctx.setLineDash([]);
            this.ctx.fillText(lz.type === 'equal_highs' ? 'EQH' : 'EQL', 55, y - 5);
            this.ctx.restore();
        });
        
        // Draw Swing Points
        this.smcData.swingPoints.forEach(sp => {
            if (sp.index >= this.offset && sp.index < this.offset + this.zoom) {
                this.ctx.save();
                this.ctx.fillStyle = sp.type === 'high' ? '#FF453A' : '#30D158';
                const x = indexToX(sp.index);
                const y = priceToY(sp.price);
                
                this.ctx.beginPath();
                this.ctx.arc(x, y, 4, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.restore();
            }
        });
    }

    drawCandles(visible, spacing, padding, priceToY, candleW) {
        visible.forEach((c, i) => {
            const x = padding.left + spacing * i + spacing / 2;
            const yH = priceToY(c.h);
            const yL = priceToY(c.l);
            const yO = priceToY(c.o);
            const yC = priceToY(c.c);
            
            const isUp = c.c >= c.o;
            const color = isUp ? '#30D158' : '#FF453A';
            
            // Wick
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = Math.max(1, candleW / 4);
            this.ctx.beginPath();
            this.ctx.moveTo(x, yH);
            this.ctx.lineTo(x, yL);
            this.ctx.stroke();
            
            // Body
            this.ctx.fillStyle = color;
            const bodyH = Math.max(Math.abs(yC - yO), 1);
            this.ctx.fillRect(x - candleW / 2, Math.min(yO, yC), candleW, bodyH);
        });
    }

    drawSMCOverlay(padding) {
        this.ctx.save();
        this.ctx.fillStyle = 'rgba(28, 28, 30, 0.9)';
        this.ctx.fillRect(padding.left + 5, padding.top + 5, 160, 85);
        
        this.ctx.fillStyle = '#FFFFFF';
        this.ctx.font = 'bold 10px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText('📊 SMC Analysis', padding.left + 10, padding.top + 18);
        
        this.ctx.font = '9px Arial';
        this.ctx.fillStyle = '#8E8E93';
        this.ctx.fillText(`OB: ${this.smcData.orderBlocks.length}`, padding.left + 10, padding.top + 32);
        this.ctx.fillText(`FVG: ${this.smcData.fvgs.length}`, padding.left + 10, padding.top + 44);
        this.ctx.fillText(`BOS: ${this.smcData.bos.length}`, padding.left + 10, padding.top + 56);
        this.ctx.fillText(`CHoCH: ${this.smcData.choch.length}`, padding.left + 10, padding.top + 68);
        this.ctx.fillText(`Liquidity: ${this.smcData.liquidityZones.length}`, padding.left + 10, padding.top + 80);
        
        this.ctx.restore();
    }

    updateInfo() {
        if (!this.data.length) return;
        
        const current = this.data[this.data.length - 1];
        const first = this.data[0];
        const change = current.c - first.o;
        
        const prices = this.data.flatMap(c => [c.h, c.l]);
        const high = Math.max(...prices);
        const low = Math.min(...prices);
        
        document.getElementById(`price${this.id}`).textContent = current.c.toFixed(2);
        
        const changeEl = document.getElementById(`change${this.id}`);
        changeEl.innerHTML = `<span class="${change >= 0 ? 'green' : 'red'}">${change >= 0 ? '+' : ''}${change.toFixed(2)}</span>`;
        
        document.getElementById(`highlow${this.id}`).textContent = `${high.toFixed(2)}/${low.toFixed(2)}`;
    }

    disconnect() {
        if (this.ws) this.ws.close();
    }
}

// Initialize charts
for (let i = 1; i <= 4; i++) {
    charts[i] = new ChartManager(i);
}

// ============ UI FUNCTIONS ============

function switchPage(pageId) {
    document.querySelectorAll('.page-container').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach((item, idx) => {
        item.classList.remove('active');
        if ((pageId === 'chartsPage' && idx === 0) ||
            (pageId === 'signalsPage' && idx === 1) ||
            (pageId === 'settingsPage' && idx === 2)) {
            item.classList.add('active');
        }
    });
    
    if (pageId === 'signalsPage') {
        displaySignals();
    }
}

function switchChart(chartId) {
    document.querySelectorAll('.single-chart').forEach(c => c.classList.remove('active'));
    document.getElementById(`chart${chartId}`).classList.add('active');
    
    document.querySelectorAll('.chart-tab').forEach((tab, idx) => {
        tab.classList.remove('active');
        if (idx === chartId - 1) tab.classList.add('active');
    });
    
    currentChartView = chartId;
    charts[chartId].resizeCanvas();
    charts[chartId].draw();
}

function changeNumCharts() {
    numActiveCharts = parseInt(document.getElementById('numCharts').value);
    const tabs = document.getElementById('chartTabs');
    tabs.innerHTML = '';
    for (let i = 1; i <= numActiveCharts; i++) {
        const tab = document.createElement('div');
        tab.className = `chart-tab ${i === 1 ? 'active' : ''}`;
        tab.textContent = `Chart ${i}`;
        tab.onclick = () => switchChart(i);
        tabs.appendChild(tab);
    }
    switchChart(1);
}

function updateChart(id) {
    const chart = charts[id];
    chart.symbol = document.getElementById(`symbol${id}`).value;
    chart.timeframe = parseInt(document.getElementById(`timeframe${id}`).value);
    
    const symbolEl = document.getElementById(`symbol${id}`);
    document.getElementById(`symbolName${id}`).textContent = symbolEl.options[symbolEl.selectedIndex].text;
    
    if (chart.ws && chart.ws.readyState === WebSocket.OPEN) {
        chart.disconnect();
        setTimeout(() => chart.connect(), 300);
    }
}

function zoom(id, dir) {
    const chart = charts[id];
    if (dir === 'in') {
        chart.zoom = Math.max(20, chart.zoom - 10);
    } else {
        chart.zoom = Math.min(150, chart.zoom + 10);
    }
    chart.draw();
}

function startAllCharts() {
    for (let i = 1; i <= numActiveCharts; i++) {
        charts[i].connect();
    }
}

function stopAllCharts() {
    for (let i = 1; i <= numActiveCharts; i++) {
        charts[i].disconnect();
    }
}

function refreshAllCharts() {
    stopAllCharts();
    setTimeout(() => startAllCharts(), 500);
}

function toggleAnalysis() {
    analysisEnabled = !analysisEnabled;
    const btn = document.getElementById('analysisToggle');
    btn.textContent = analysisEnabled ? '📊 SMC ON' : '📊 SMC OFF';
    btn.classList.toggle('active', analysisEnabled);
    
    Object.values(charts).forEach(chart => chart.draw());
}

function updateConnectionStatus(connected) {
    const indicator = document.querySelector('.status-indicator');
    indicator.className = `status-indicator ${connected ? 'status-connected' : 'status-disconnected'}`;
}

// ============ SIGNAL MANAGEMENT ============

function addSignal(signal) {
    const exists = allSignals.find(s => 
        s.name === signal.name && 
        s.chartId === signal.chartId && 
        Date.now() - s.timestamp < 300000
    );
    
    if (!exists) {
        allSignals.unshift(signal);
        allSignals = allSignals.slice(0, 50);
        saveSignalToFirebase(signal);
        
        if (signal.confidence >= 75) {
            playSound();
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('SMC Signal Detected!', {
                    body: `${signal.symbol} - ${signal.name} (${signal.bias.toUpperCase()})`
                });
            }
        }
    }
}

async function saveSignalToFirebase(signal) {
    try {
        await fetch(`${FIREBASE_URL}/signals/${signal.id}.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(signal)
        });
    } catch (e) {
        console.error('Firebase error:', e);
    }
}

async function loadSignalsFromFirebase() {
    try {
        const response = await fetch(`${FIREBASE_URL}/signals.json`);
        const data = await response.json();
        if (data) {
            allSignals = Object.values(data).sort((a, b) => b.timestamp - a.timestamp);
            displaySignals();
        }
    } catch (e) {
        console.error('Firebase load error:', e);
    }
}

function displaySignals() {
    const container = document.getElementById('signalsList');
    
    let filtered = allSignals;
    if (signalFilter !== 'all') {
        filtered = allSignals.filter(s => s.bias === signalFilter);
    }
    
    if (!filtered.length) {
        container.innerHTML = `
            <div class="no-signals">
                <div class="no-signals-icon">📊</div>
                <div>No ${signalFilter === 'all' ? '' : signalFilter} signals</div>
                <div style="font-size: 12px; margin-top: 8px;">Start charts to detect SMC patterns</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filtered.map(s => `
        <div class="signal-card ${s.bias}">
            <div class="signal-header">
                <div>
                    <div class="signal-name">${s.name}</div>
                    <div class="signal-symbol">${s.symbol}</div>
                </div>
                <div class="signal-badge ${s.bias}">${s.bias.toUpperCase()}</div>
            </div>
            <div class="signal-details">
                <div class="signal-detail">
                    <span class="detail-label">Entry:</span>
                    <span class="detail-value">${s.entry}</span>
                </div>
                <div class="signal-detail">
                    <span class="detail-label">TP1:</span>
                    <span class="detail-value green">${s.tp1}</span>
                </div>
                <div class="signal-detail">
                    <span class="detail-label">TP2:</span>
                    <span class="detail-value green">${s.tp2}</span>
                </div>
                <div class="signal-detail">
                    <span class="detail-label">TP3:</span>
                    <span class="detail-value green">${s.tp3}</span>
                </div>
                <div class="signal-detail">
                    <span class="detail-label">SL:</span>
                    <span class="detail-value red">${s.sl}</span>
                </div>
                <div class="signal-detail">
                    <span class="detail-label">TF:</span>
                    <span class="detail-value">${getTimeframeLabel(s.timeframe)}</span>
                </div>
            </div>
            <div class="confidence-bar">
                <div class="confidence-fill ${s.confidence >= 75 ? 'high' : ''}" style="width: ${s.confidence}%"></div>
            </div>
            <div class="signal-time">${new Date(s.timestamp).toLocaleString()}</div>
        </div>
    `).join('');
}

function filterSignals(type) {
    signalFilter = type;
    document.querySelectorAll('.signal-filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if ((type === 'all' && btn.textContent === 'All') ||
            (type === 'bullish' && btn.textContent === 'Bullish') ||
            (type === 'bearish' && btn.textContent === 'Bearish')) {
            btn.classList.add('active');
        }
    });
    displaySignals();
}

async function clearAllSignals() {
    if (confirm('Clear all signals?')) {
        try {
            await fetch(`${FIREBASE_URL}/signals.json`, { method: 'DELETE' });
            allSignals = [];
            displaySignals();
        } catch (e) {
            console.error('Firebase clear error:', e);
        }
    }
}

function getTimeframeLabel(tf) {
    const labels = {
        60: '1M',
        120: '2M',
        180: '3M',
        300: '5M',
        600: '10M',
        900: '15M',
        1800: '30M',
        3600: '1H',
        7200: '2H',
        14400: '4H',
        28800: '8H',
        86400: '1D'
    };
    return labels[tf] || `${tf}s`;
}
function toggleSetting(el) {
    el.classList.toggle('active');
}

function playSound() {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
}

// ============ INITIALIZATION ============

window.addEventListener('load', () => {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
    
    loadSignalsFromFirebase();
    
    window.addEventListener('resize', () => {
        Object.values(charts).forEach(c => {
            c.resizeCanvas();
            c.draw();
        });
    });
    
    setTimeout(() => startAllCharts(), 500);
});
