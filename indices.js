// ============================================================================
// INDICES DATA PROVIDER - ALTERNATIVE SOURCES
// Multiple fallback sources for reliable indices data
// ============================================================================

class IndicesDataProvider {
    constructor() {
        this.activeSource = null;
        this.ws = null;
        this.dataCallback = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
    }

    // ============================================================================
    // PRIMARY SOURCE: TWELVE DATA (WebSocket)
    // ============================================================================
    async connectTwelveData(symbol, timeframe, callback) {
        console.log('Attempting Twelve Data connection...');
        
        try {
            this.dataCallback = callback;
            this.activeSource = 'twelvedata';
            
            // Convert symbol to Twelve Data format
            const tdSymbol = this.convertToTwelveDataSymbol(symbol);
            
            this.ws = new WebSocket('wss://ws.twelvedata.com/v1/quotes/price?apikey=demo');
            
            this.ws.onopen = () => {
                console.log('Twelve Data connected');
                this.ws.send(JSON.stringify({
                    action: 'subscribe',
                    params: {
                        symbols: tdSymbol
                    }
                }));
                
                // Request historical data via REST
                this.fetchTwelveDataHistory(tdSymbol, timeframe);
            };
            
            this.ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.price) {
                    this.handleTwelveDataTick(data);
                }
            };
            
            this.ws.onerror = (error) => {
                console.error('Twelve Data error:', error);
                this.tryNextSource(symbol, timeframe, callback);
            };
            
            this.ws.onclose = () => {
                console.log('Twelve Data disconnected');
                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    setTimeout(() => {
                        this.connectTwelveData(symbol, timeframe, callback);
                    }, this.reconnectDelay);
                }
            };
            
        } catch (error) {
            console.error('Twelve Data connection failed:', error);
            this.tryNextSource(symbol, timeframe, callback);
        }
    }

    convertToTwelveDataSymbol(symbol) {
        const mapping = {
            'GER40': 'DAX',
            'US30': 'DJI',
            'US100': 'NDX',
            'XAUUSD': 'XAU/USD'
        };
        return mapping[symbol] || symbol;
    }

    async fetchTwelveDataHistory(symbol, timeframe) {
        try {
            const interval = this.convertTimeframeToInterval(timeframe);
            const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${interval}&outputsize=1000&apikey=demo`;
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.values) {
                const candles = data.values.map(v => ({
                    x: new Date(v.datetime).getTime(),
                    o: parseFloat(v.open),
                    h: parseFloat(v.high),
                    l: parseFloat(v.low),
                    c: parseFloat(v.close)
                })).reverse();
                
                if (this.dataCallback) {
                    this.dataCallback({ type: 'history', data: candles });
                }
            }
        } catch (error) {
            console.error('Twelve Data history fetch failed:', error);
        }
    }

    handleTwelveDataTick(data) {
        if (this.dataCallback) {
            this.dataCallback({
                type: 'tick',
                data: {
                    price: parseFloat(data.price),
                    time: Date.now()
                }
            });
        }
    }

    // ============================================================================
    // SECONDARY SOURCE: POLYGON.IO
    // ============================================================================
    async connectPolygon(symbol, timeframe, callback) {
        console.log('Attempting Polygon.io connection...');
        
        try {
            this.dataCallback = callback;
            this.activeSource = 'polygon';
            
            const polySymbol = this.convertToPolygonSymbol(symbol);
            
            // Polygon WebSocket (requires API key - using demo)
            this.ws = new WebSocket('wss://socket.polygon.io/stocks');
            
            this.ws.onopen = () => {
                console.log('Polygon.io connected');
                this.ws.send(JSON.stringify({
                    action: 'auth',
                    params: 'demo'
                }));
                
                setTimeout(() => {
                    this.ws.send(JSON.stringify({
                        action: 'subscribe',
                        params: `T.${polySymbol}`
                    }));
                }, 1000);
                
                this.fetchPolygonHistory(polySymbol, timeframe);
            };
            
            this.ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data[0] && data[0].ev === 'T') {
                    this.handlePolygonTick(data[0]);
                }
            };
            
            this.ws.onerror = (error) => {
                console.error('Polygon error:', error);
                this.tryNextSource(symbol, timeframe, callback);
            };
            
        } catch (error) {
            console.error('Polygon connection failed:', error);
            this.tryNextSource(symbol, timeframe, callback);
        }
    }

    convertToPolygonSymbol(symbol) {
        const mapping = {
            'GER40': 'DAX',
            'US30': 'DIA',
            'US100': 'QQQ',
            'XAUUSD': 'GLD'
        };
        return mapping[symbol] || symbol;
    }

    async fetchPolygonHistory(symbol, timeframe) {
        try {
            const interval = this.convertTimeframeToInterval(timeframe);
            const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const to = new Date().toISOString().split('T')[0];
            
            const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/${interval}/${from}/${to}?apiKey=demo`;
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.results) {
                const candles = data.results.map(r => ({
                    x: r.t,
                    o: r.o,
                    h: r.h,
                    l: r.l,
                    c: r.c
                }));
                
                if (this.dataCallback) {
                    this.dataCallback({ type: 'history', data: candles });
                }
            }
        } catch (error) {
            console.error('Polygon history fetch failed:', error);
        }
    }

    handlePolygonTick(data) {
        if (this.dataCallback) {
            this.dataCallback({
                type: 'tick',
                data: {
                    price: data.p,
                    time: data.t
                }
            });
        }
    }

    // ============================================================================
    // TERTIARY SOURCE: YAHOO FINANCE (REST API via proxy)
    // ============================================================================
    async connectYahooFinance(symbol, timeframe, callback) {
        console.log('Attempting Yahoo Finance connection...');
        
        try {
            this.dataCallback = callback;
            this.activeSource = 'yahoo';
            
            const yahooSymbol = this.convertToYahooSymbol(symbol);
            
            // Poll Yahoo Finance every 5 seconds for updates
            this.fetchYahooData(yahooSymbol, timeframe);
            
            this.pollInterval = setInterval(() => {
                this.fetchYahooData(yahooSymbol, timeframe);
            }, 5000);
            
        } catch (error) {
            console.error('Yahoo Finance connection failed:', error);
            this.tryNextSource(symbol, timeframe, callback);
        }
    }

    convertToYahooSymbol(symbol) {
        const mapping = {
            'GER40': '^GDAXI',
            'US30': '^DJI',
            'US100': '^IXIC',
            'XAUUSD': 'GC=F'
        };
        return mapping[symbol] || symbol;
    }

    async fetchYahooData(symbol, timeframe) {
        try {
            const interval = this.convertTimeframeToYahooInterval(timeframe);
            const period = '1mo';
            
            // Using Yahoo Finance API via RapidAPI (demo mode)
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${period}`;
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.chart && data.chart.result[0]) {
                const result = data.chart.result[0];
                const timestamps = result.timestamp;
                const quotes = result.indicators.quote[0];
                
                const candles = timestamps.map((t, i) => ({
                    x: t * 1000,
                    o: quotes.open[i],
                    h: quotes.high[i],
                    l: quotes.low[i],
                    c: quotes.close[i]
                })).filter(c => c.o && c.h && c.l && c.c);
                
                if (this.dataCallback) {
                    this.dataCallback({ type: 'history', data: candles });
                }
            }
        } catch (error) {
            console.error('Yahoo Finance fetch failed:', error);
        }
    }

    convertTimeframeToYahooInterval(timeframe) {
        const mapping = {
            60: '1m',
            300: '5m',
            900: '15m',
            1800: '30m',
            3600: '1h',
            14400: '4h',
            86400: '1d'
        };
        return mapping[timeframe] || '5m';
    }

    // ============================================================================
    // FALLBACK SOURCE: DERIV (Original)
    // ============================================================================
    async connectDeriv(symbol, timeframe, callback) {
        console.log('Attempting Deriv connection (fallback)...');
        
        try {
            this.dataCallback = callback;
            this.activeSource = 'deriv';
            
            const derivSymbol = this.convertToDerivSymbol(symbol);
            
            this.ws = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=1089');
            
            this.ws.onopen = () => {
                console.log('Deriv connected');
                
                this.ws.send(JSON.stringify({
                    ticks: derivSymbol,
                    subscribe: 1
                }));
                
                this.ws.send(JSON.stringify({
                    ticks_history: derivSymbol,
                    count: 1000,
                    end: 'latest',
                    style: 'candles',
                    granularity: timeframe
                }));
            };
            
            this.ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                
                if (data.candles) {
                    const candles = data.candles.map(c => ({
                        x: c.epoch * 1000,
                        o: parseFloat(c.open),
                        h: parseFloat(c.high),
                        l: parseFloat(c.low),
                        c: parseFloat(c.close)
                    }));
                    
                    if (this.dataCallback) {
                        this.dataCallback({ type: 'history', data: candles });
                    }
                } else if (data.tick) {
                    if (this.dataCallback) {
                        this.dataCallback({
                            type: 'tick',
                            data: {
                                price: parseFloat(data.tick.quote),
                                time: data.tick.epoch * 1000
                            }
                        });
                    }
                }
            };
            
            this.ws.onerror = (error) => {
                console.error('Deriv error:', error);
            };
            
        } catch (error) {
            console.error('Deriv connection failed:', error);
        }
    }

    convertToDerivSymbol(symbol) {
        const mapping = {
            'XAUUSD': 'frxXAUUSD',
            'GER40': 'WLDGER40',
            'US30': 'WLDUS30',
            'US100': 'WLDUS100'
        };
        return mapping[symbol] || symbol;
    }

    // ============================================================================
    // SOURCE MANAGEMENT
    // ============================================================================
    async connect(symbol, timeframe, callback) {
        console.log(`Connecting to data source for ${symbol}...`);
        
        // Try sources in order: Yahoo (most reliable) -> Deriv (fallback)
        // For indices, Yahoo Finance is generally more reliable
        if (symbol === 'XAUUSD') {
            // Gold works better on Deriv
            await this.connectDeriv(symbol, timeframe, callback);
        } else {
            // Indices work better on Yahoo Finance
            await this.connectYahooFinance(symbol, timeframe, callback);
        }
    }

    tryNextSource(symbol, timeframe, callback) {
        console.log('Trying next data source...');
        
        if (this.activeSource === 'twelvedata') {
            this.connectPolygon(symbol, timeframe, callback);
        } else if (this.activeSource === 'polygon') {
            this.connectYahooFinance(symbol, timeframe, callback);
        } else if (this.activeSource === 'yahoo') {
            this.connectDeriv(symbol, timeframe, callback);
        } else {
            console.error('All data sources failed');
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        
        this.activeSource = null;
        this.dataCallback = null;
        this.reconnectAttempts = 0;
    }

    convertTimeframeToInterval(timeframe) {
        const mapping = {
            60: '1min',
            300: '5min',
            900: '15min',
            1800: '30min',
            3600: '1h',
            14400: '4h',
            86400: '1day'
        };
        return mapping[timeframe] || '5min';
    }

    getActiveSource() {
        return this.activeSource;
    }
}

// Export for use in analysis.js
if (typeof window !== 'undefined') {
    window.IndicesDataProvider = IndicesDataProvider;
}
