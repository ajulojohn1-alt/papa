var hd=Object.defineProperty;var ud=(r,e,t)=>e in r?hd(r,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):r[e]=t;var El=(r,e,t)=>ud(r,typeof e!="symbol"?e+"":e,t);(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))i(n);new MutationObserver(n=>{for(const s of n)if(s.type==="childList")for(const a of s.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&i(a)}).observe(document,{childList:!0,subtree:!0});function t(n){const s={};return n.integrity&&(s.integrity=n.integrity),n.referrerPolicy&&(s.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?s.credentials="include":n.crossOrigin==="anonymous"?s.credentials="omit":s.credentials="same-origin",s}function i(n){if(n.ep)return;n.ep=!0;const s=t(n);fetch(n.href,s)}})();const dd=1/60,fd=5,pd=120,sa=1e-9,wl=1e3,Tl=1,bl=240;class zs{constructor(e){this._values=new Float64Array(e),this._capacity=e,this._index=0,this._count=0,this._sum=0}push(e){!Number.isFinite(e)||e<0||(this._count===this._capacity?this._sum-=this._values[this._index]:this._count+=1,this._values[this._index]=e,this._sum+=e,this._index=(this._index+1)%this._capacity)}get average(){return this._count===0?0:this._sum/this._count}get samples(){return this._count}reset(){this._values.fill(0),this._index=0,this._count=0,this._sum=0}}class _d{constructor(e={}){if(e===null||typeof e!="object")throw new TypeError("[GameLoop] options must be an object.");const t=e.fixedTimeStep??dd;if(!Number.isFinite(t)||t<=0||t>Tl)throw new RangeError(`[GameLoop] fixedTimeStep must be finite and in (0, ${Tl}] seconds; received ${t}.`);const i=e.maxFrameSkips??fd;if(!Number.isInteger(i)||i<1||i>bl)throw new RangeError(`[GameLoop] maxFrameSkips must be an integer in [1, ${bl}]; received ${i}.`);const n=e.metricsWindow??pd;if(!Number.isInteger(n)||n<2||n>4096)throw new RangeError(`[GameLoop] metricsWindow must be an integer in [2, 4096]; received ${n}.`);if(this._fixedTimeStep=t,this._maxFrameSkips=i,this._maxDeltaSeconds=t*i,e.update!==void 0&&typeof e.update!="function")throw new TypeError("[GameLoop] update must be a function.");if(e.render!==void 0&&typeof e.render!="function")throw new TypeError("[GameLoop] render must be a function.");this._updateCallback=e.update??null,this._renderCallback=e.render??null,this._accumulator=0,this._interpolationAlpha=0,this._lastTimestamp=null,this._rafId=null,this._running=!1,this._paused=!1,this._totalTicks=0,this._totalFrames=0,this._ticksLastFrame=0,this._maxTicksInFrame=0,this._droppedTicks=0,this._clampedFrames=0,this._metricsWindow=n,this._frameInterval=new zs(n),this._frameWork=new zs(n),this._updateWork=new zs(n),this._renderWork=new zs(n),this._lastSampleTimestamp=null,this._worstFrameMs=0,this._frame=s=>this._advance(s)}start(){return this._running?(this._paused&&this.resume(),this):(this._running=!0,this._paused=!1,this._accumulator=0,this._interpolationAlpha=0,this._lastTimestamp=null,this._lastSampleTimestamp=null,this._totalTicks=0,this._totalFrames=0,this._ticksLastFrame=0,this._maxTicksInFrame=0,this._droppedTicks=0,this._clampedFrames=0,this.resetMetrics(),this._schedule(),this)}stop(){return this._cancelScheduledFrame(),this._running=!1,this._paused=!1,this._lastTimestamp=null,this._accumulator=0,this._interpolationAlpha=0,this}pause(){return!this._running||this._paused?this:(this._paused=!0,this._cancelScheduledFrame(),this._lastTimestamp=null,this)}resume(){return!this._running||!this._paused?this:(this._paused=!1,this._lastTimestamp=null,this._lastSampleTimestamp=null,this._schedule(),this)}setUpdateCallback(e){if(e!==null&&typeof e!="function")throw new TypeError("[GameLoop] update callback must be a function or null.");return this._updateCallback=e,this}setRenderCallback(e){if(e!==null&&typeof e!="function")throw new TypeError("[GameLoop] render callback must be a function or null.");return this._renderCallback=e,this}isRunning(){return this._running}isPaused(){return this._paused}getInterpolationAlpha(){return this._interpolationAlpha}getFixedTimeStep(){return this._fixedTimeStep}resetMetrics(){return this._frameInterval.reset(),this._frameWork.reset(),this._updateWork.reset(),this._renderWork.reset(),this._lastSampleTimestamp=null,this._worstFrameMs=0,this}getMetrics(){const e=this._frameInterval.average;return{fps:e>0?wl/e:0,frameMs:e,frameWorkMs:this._frameWork.average,updateMs:this._updateWork.average,renderMs:this._renderWork.average,worstFrameMs:this._worstFrameMs,samples:this._frameWork.samples,ticksLastFrame:this._ticksLastFrame,maxTicksInFrame:this._maxTicksInFrame,totalTicks:this._totalTicks,totalFrames:this._totalFrames,droppedTicks:this._droppedTicks,clampedFrames:this._clampedFrames,simulatedSeconds:this._totalTicks*this._fixedTimeStep,accumulator:this._accumulator,interpolationAlpha:this._interpolationAlpha,fixedTimeStep:this._fixedTimeStep,maxFrameSkips:this._maxFrameSkips,running:this._running,paused:this._paused}}_schedule(){this._rafId===null&&(this._rafId=requestAnimationFrame(this._frame))}_cancelScheduledFrame(){this._rafId!==null&&(cancelAnimationFrame(this._rafId),this._rafId=null)}_clampDelta(e){return!Number.isFinite(e)||e<=0?0:e>this._maxDeltaSeconds?(this._clampedFrames+=1,this._maxDeltaSeconds):e}_consumeAccumulator(){if(this._updateCallback===null)return this._accumulator=0,0;const e=this._fixedTimeStep;let t=0;for(;t<this._maxFrameSkips&&this._accumulator+sa>=e;)this._updateCallback(e),this._accumulator=Math.max(0,this._accumulator-e),t+=1;if(this._accumulator+sa>=e){const i=Math.floor(this._accumulator/e+sa);this._droppedTicks+=Math.max(1,i),this._accumulator=0}return t}_advance(e){if(this._rafId=null,!this._running||this._paused)return;this._lastTimestamp===null&&(this._lastTimestamp=e);const t=(e-this._lastTimestamp)/wl;this._lastTimestamp=e;const i=this._clampDelta(t);this._accumulator+=i;const n=performance.now();let s=0,a=0,o=0;try{const c=n;if(o=this._consumeAccumulator(),s=performance.now()-c,this._interpolationAlpha=Math.min(1,Math.max(0,this._accumulator/this._fixedTimeStep)),this._renderCallback!==null){const h=performance.now();this._renderCallback(this._interpolationAlpha),a=performance.now()-h}}catch(c){throw this.stop(),c}const l=performance.now()-n;if(this._totalFrames+=1,this._totalTicks+=o,this._ticksLastFrame=o,o>this._maxTicksInFrame&&(this._maxTicksInFrame=o),l>this._worstFrameMs&&(this._worstFrameMs=l),this._lastSampleTimestamp!==null){const c=e-this._lastSampleTimestamp;this._frameInterval.push(c)}this._lastSampleTimestamp=e,this._frameWork.push(l),this._updateWork.push(s),this._renderWork.push(a),this._schedule()}}const Al=1,Cl=16384,Rl=1048576,md=120,gd=60,xd=" ",ra=4294967295,Pl=255;function $i(r){return Number.isFinite(r)?Math.max(0,Math.min(255,Math.round(r))):0}function ft(r,e,t,i=255){return(($i(r)&255)<<24|($i(e)&255)<<16|($i(t)&255)<<8|$i(i)&255)>>>0}const Il=Object.freeze({black:ft(0,0,0),white:ft(255,255,255),red:ft(255,0,0),orange:ft(255,119,0),yellow:ft(255,255,0),lime:ft(0,255,0),green:ft(0,128,0),cyan:ft(0,255,255),teal:ft(0,128,128),blue:ft(0,128,255),navy:ft(0,0,128),magenta:ft(255,0,255),purple:ft(128,0,128),pink:ft(255,192,203),brown:ft(139,69,19),gray:ft(128,128,128),grey:ft(128,128,128),darkgray:ft(64,64,64),darkgrey:ft(64,64,64),lightgray:ft(192,192,192),lightgrey:ft(192,192,192),silver:ft(192,192,192),transparent:0});function yd(r){const e=r.slice(1);if(!(/^[0-9a-f]{3}$/i.test(e)||/^[0-9a-f]{4}$/i.test(e)||/^[0-9a-f]{6}$/i.test(e)||/^[0-9a-f]{8}$/i.test(e)))throw new RangeError(`[ASCIIBuffer] Invalid hex color: ${r}`);let i=0,n=0,s=0,a=255;return e.length===3||e.length===4?(i=parseInt(e[0]+e[0],16),n=parseInt(e[1]+e[1],16),s=parseInt(e[2]+e[2],16),e.length===4&&(a=parseInt(e[3]+e[3],16))):(i=parseInt(e.slice(0,2),16),n=parseInt(e.slice(2,4),16),s=parseInt(e.slice(4,6),16),e.length===8&&(a=parseInt(e.slice(6,8),16))),ft(i,n,s,a)}function cu(r){const e=/^(?:rgba?|hsla?)\((.*)\)$/.exec(r);if(!e)throw new RangeError(`[ASCIIBuffer] Invalid functional color: ${r}`);return e[1].trim()}function hu(r){let e=null,t=r;const i=r.indexOf("/");i!==-1&&(e=r.slice(i+1).trim(),t=r.slice(0,i).trim());let n;return t.includes(",")?n=t.split(",").map(s=>s.trim()).filter(s=>s.length>0):n=t.split(/\s+/).filter(s=>s.length>0),e===null&&n.length===4&&(e=n[3],n=n.slice(0,3)),{parts:n,alpha:e}}function aa(r){const e=String(r).trim().toLowerCase();if(e.endsWith("%")){const i=parseFloat(e);if(!Number.isFinite(i))throw new RangeError(`[ASCIIBuffer] Invalid color channel: ${r}`);return $i(i*2.55)}const t=parseFloat(e);if(!Number.isFinite(t))throw new RangeError(`[ASCIIBuffer] Invalid color channel: ${r}`);return $i(t)}function uu(r){if(r==null)return 255;const e=String(r).trim().toLowerCase();if(e.length===0)return 255;if(e.endsWith("%")){const i=parseFloat(e);if(!Number.isFinite(i))throw new RangeError(`[ASCIIBuffer] Invalid alpha channel: ${r}`);return $i(i*2.55)}const t=parseFloat(e);if(!Number.isFinite(t))throw new RangeError(`[ASCIIBuffer] Invalid alpha channel: ${r}`);return t>1?$i(t):$i(t*255)}function vd(r){const e=cu(r),{parts:t,alpha:i}=hu(e);if(t.length!==3)throw new RangeError(`[ASCIIBuffer] Invalid rgb color: ${r}`);return ft(aa(t[0]),aa(t[1]),aa(t[2]),uu(i))}function Sd(r){let e=String(r).trim().toLowerCase(),t=1;e.endsWith("deg")?e=e.slice(0,-3):e.endsWith("rad")?(t=180/Math.PI,e=e.slice(0,-3)):e.endsWith("grad")?(t=.9,e=e.slice(0,-4)):e.endsWith("turn")&&(t=360,e=e.slice(0,-4));const i=parseFloat(e);if(!Number.isFinite(i))throw new RangeError(`[ASCIIBuffer] Invalid hue: ${r}`);let n=i*t;return n%=360,n<0&&(n+=360),n}function Dl(r){const e=String(r).trim().toLowerCase(),t=parseFloat(e);if(!Number.isFinite(t))throw new RangeError(`[ASCIIBuffer] Invalid percentage: ${r}`);let i;return e.endsWith("%")||t>1?i=t/100:i=t,Math.max(0,Math.min(1,i))}function oa(r,e,t){return t<0&&(t+=1),t>1&&(t-=1),t<1/6?r+(e-r)*6*t:t<1/2?e:t<2/3?r+(e-r)*(2/3-t)*6:r}function Md(r,e,t){const i=r/360;if(e===0){const a=t*255;return[a,a,a]}const n=t<.5?t*(1+e):t+e-t*e,s=2*t-n;return[oa(s,n,i+1/3)*255,oa(s,n,i)*255,oa(s,n,i-1/3)*255]}function Ed(r){const e=cu(r),{parts:t,alpha:i}=hu(e);if(t.length!==3)throw new RangeError(`[ASCIIBuffer] Invalid hsl color: ${r}`);const n=Sd(t[0]),s=Dl(t[1]),a=Dl(t[2]),[o,l,c]=Md(n,s,a);return ft(o,l,c,uu(i))}function Ws(r,e){if(!Number.isInteger(r)||r<Al||r>Cl)throw new RangeError(`[ASCIIBuffer] ${e} must be an integer between ${Al} and ${Cl}; received ${r}.`)}function Ll(r){if(!Number.isFinite(r)||r>Rl)throw new RangeError(`[ASCIIBuffer] Grid size ${r} exceeds maximum supported cell count ${Rl}.`)}class Z{constructor(e={}){if(e===null||typeof e!="object")throw new TypeError("[ASCIIBuffer] options must be an object.");const t=e.cols??e.columns??md,i=e.rows??gd;Ws(t,"cols"),Ws(i,"rows"),this._cols=t,this._rows=i,this._cellCount=t*i,Ll(this._cellCount),this._defaultCharCode=Z.charToCodePoint(e.defaultChar??xd,32),this._defaultFg=Z.packColor(e.defaultFg??ra,ra),this._defaultBg=Z.packColor(e.defaultBg??Pl,Pl),this._allocateArrays(),this._resetToDefaults()}static fromViewport({viewportWidth:e,viewportHeight:t,cellWidth:i,cellHeight:n,options:s={}}){const a=[e,t,i,n];for(const c of a)if(!Number.isFinite(c)||c<=0)throw new RangeError("[ASCIIBuffer] fromViewport requires positive finite metrics.");const o=Math.max(1,Math.floor(e/i)),l=Math.max(1,Math.floor(t/n));return new Z({...s,cols:o,rows:l})}static charToCodePoint(e,t=32){let i;if(e==null)i=t;else if(typeof e=="number")i=Math.trunc(e);else if(typeof e=="string")e.length===0?i=t:i=e.codePointAt(0);else throw new TypeError("[ASCIIBuffer] char must be a string, number, null, or undefined.");if(!Number.isInteger(i)||i<0||i>1114111)throw new RangeError(`[ASCIIBuffer] Invalid Unicode code point: ${e}`);return i<32||i===127?t:i}static packColor(e,t=ra){if(e==null)return t>>>0;if(typeof e=="number")return Math.trunc(e)>>>0;if(typeof e!="string")throw new TypeError("[ASCIIBuffer] color must be a number, string, null, or undefined.");const i=e.trim().toLowerCase();if(i==="transparent")return 0;if(Object.prototype.hasOwnProperty.call(Il,i))return Il[i];if(i.startsWith("#"))return yd(i);if(i.startsWith("rgb"))return vd(i);if(i.startsWith("hsl"))return Ed(i);throw new RangeError(`[ASCIIBuffer] Unsupported color format: ${e}`)}static unpackColor(e){const t=e>>>0;return{r:t>>>24&255,g:t>>>16&255,b:t>>>8&255,a:t&255}}static colorToCSS(e){const{r:t,g:i,b:n,a:s}=Z.unpackColor(e);return s===255?`rgb(${t},${i},${n})`:`rgba(${t},${i},${n},${(s/255).toFixed(3)})`}get cols(){return this._cols}get columns(){return this._cols}get rows(){return this._rows}get cellCount(){return this._cellCount}get defaultCharCode(){return this._defaultCharCode}get defaultChar(){return String.fromCodePoint(this._defaultCharCode)}get defaultFg(){return this._defaultFg}get defaultBg(){return this._defaultBg}get defaultFgCSS(){return Z.colorToCSS(this._defaultFg)}get defaultBgCSS(){return Z.colorToCSS(this._defaultBg)}get isDirty(){return this._fullDirty||this._dirtyIndices.length>0}get charCodes(){return this._charBack}get foregroundColors(){return this._fgBack}get backgroundColors(){return this._bgBack}getDirtyCells(){return this._lastDirtyCells}getDirtyRect(){return this._dirtyRect?{...this._dirtyRect}:null}isValidCell(e,t){return Number.isInteger(e)&&Number.isInteger(t)&&e>=0&&t>=0&&e<this._cols&&t<this._rows}cellIndex(e,t){return t*this._cols+e}cellX(e){return e%this._cols}cellY(e){return e/this._cols|0}clear(){return this._charBack.fill(this._defaultCharCode),this._fgBack.fill(this._defaultFg),this._bgBack.fill(this._defaultBg),this._fullDirty=!0,this._dirtyIndices.length=0,this._dirtyFlags.fill(0),this}setChar(e,t,i,n=null,s=null){const a=Math.trunc(e),o=Math.trunc(t);if(!this.isValidCell(a,o))return!1;const l=this.cellIndex(a,o),c=i==null?this._charBack[l]:Z.charToCodePoint(i,this._defaultCharCode),h=n==null?this._fgBack[l]:Z.packColor(n,this._fgBack[l]),d=s==null?this._bgBack[l]:Z.packColor(s,this._bgBack[l]);return this._charBack[l]=c,this._fgBack[l]=h,this._bgBack[l]=d,this._charBack[l]!==this._charFront[l]||this._fgBack[l]!==this._fgFront[l]||this._bgBack[l]!==this._bgFront[l]?this._markCandidate(l):this._dirtyFlags[l]=0,!0}getChar(e,t){const i=Math.trunc(e),n=Math.trunc(t);if(!this.isValidCell(i,n))return null;const s=this.cellIndex(i,n);return String.fromCodePoint(this._charBack[s])}getCharCode(e,t){const i=Math.trunc(e),n=Math.trunc(t);return this.isValidCell(i,n)?this._charBack[this.cellIndex(i,n)]:-1}getCellStyle(e,t){const i=Math.trunc(e),n=Math.trunc(t);if(!this.isValidCell(i,n))return null;const s=this.cellIndex(i,n),a=this._charBack[s],o=this._fgBack[s],l=this._bgBack[s];return{x:i,y:n,index:s,charCode:a,char:String.fromCodePoint(a),fg:o,bg:l,fgCSS:Z.colorToCSS(o),bgCSS:Z.colorToCSS(l)}}fillRegion(e,t,i,n,s,a=null,o=null){const l=this._clipRegion(e,t,i,n);if(!l)return 0;const c=s==null?this._defaultCharCode:Z.charToCodePoint(s,this._defaultCharCode),h=a==null?this._defaultFg:Z.packColor(a,this._defaultFg),d=o==null?this._defaultBg:Z.packColor(o,this._defaultBg),{x0:u,y0:f,x1:m,y1:y,width:p}=l;for(let A=f;A<y;A+=1){const S=this.cellIndex(u,A),M=S+p;this._charBack.subarray(S,M).fill(c),this._fgBack.subarray(S,M).fill(h),this._bgBack.subarray(S,M).fill(d)}const _=l.width*l.height,T=Math.max(1024,this._cellCount>>>2);if(this._fullDirty||_>T)this._fullDirty=!0,this._dirtyIndices.length=0;else for(let A=f;A<y;A+=1){const S=this.cellIndex(u,A);for(let M=0;M<p;M+=1)this._markCandidate(S+M)}return _}writeText(e,t,i,n=null,s=null){if(typeof i!="string"||i.length===0)return 0;let a=0;const o=i.split(/\r?\n/),l=Math.trunc(e),c=Math.trunc(t);for(let h=0;h<o.length;h+=1){const d=c+h;if(d<0)continue;if(d>=this._rows)break;let u=l;for(const f of o[h]){if(u>=this._cols)break;u>=0&&this.setChar(u,d,f,n,s)&&(a+=1),u+=1}}return a}commit(){const e=[];let t=1/0,i=1/0,n=-1/0,s=-1/0;const a=h=>{const d=h%this._cols,u=h/this._cols|0;d<t&&(t=d),u<i&&(i=u),d>n&&(n=d),u>s&&(s=u)},o=h=>{this._charFront[h]=this._charBack[h],this._fgFront[h]=this._fgBack[h],this._bgFront[h]=this._bgBack[h]},l=h=>this._charBack[h]!==this._charFront[h]||this._fgBack[h]!==this._fgFront[h]||this._bgBack[h]!==this._bgFront[h];if(this._fullDirty){for(let h=0;h<this._cellCount;h+=1)l(h)&&(o(h),e.push(h),a(h));this._dirtyFlags.fill(0),this._dirtyIndices.length=0,this._fullDirty=!1}else if(this._dirtyIndices.length>0){const h=this._dirtyIndices;for(let d=0;d<h.length;d+=1){const u=h[d];this._dirtyFlags[u]!==0&&(this._dirtyFlags[u]=0,l(u)&&(o(u),e.push(u),a(u)))}h.length=0}const c=e.length>0?{x:t,y:i,width:n-t+1,height:s-i+1}:null;return this._lastDirtyCells=e,this._dirtyRect=c,{count:e.length,cells:e,rect:c}}present(){return this.commit()}forceSync(){return this._charFront.set(this._charBack),this._fgFront.set(this._fgBack),this._bgFront.set(this._bgBack),this._clearDirtyState(),this}forEachCell(e){if(typeof e!="function")throw new TypeError("[ASCIIBuffer] forEachCell requires a function.");for(let t=0;t<this._rows;t+=1){let i=t*this._cols;for(let n=0;n<this._cols;n+=1,i+=1)e(n,t,this._charBack[i],this._fgBack[i],this._bgBack[i],i)}return this}forEachActiveCell(e){if(typeof e!="function")throw new TypeError("[ASCIIBuffer] forEachActiveCell requires a function.");for(let t=0;t<this._rows;t+=1){let i=t*this._cols;for(let n=0;n<this._cols;n+=1,i+=1){const s=this._charBack[i],a=this._fgBack[i],o=this._bgBack[i];(s!==this._defaultCharCode||a!==this._defaultFg||o!==this._defaultBg)&&e(n,t,s,a,o,i)}}return this}forEachCellInRegion(e,t,i,n,s){if(typeof s!="function")throw new TypeError("[ASCIIBuffer] forEachCellInRegion requires a function.");const a=this._clipRegion(e,t,i,n);if(!a)return this;const{x0:o,y0:l,x1:c,y1:h}=a;for(let d=l;d<h;d+=1){let u=this.cellIndex(o,d);for(let f=o;f<c;f+=1,u+=1)s(f,d,this._charBack[u],this._fgBack[u],this._bgBack[u],u)}return this}forEachDirtyCell(e){if(typeof e!="function")throw new TypeError("[ASCIIBuffer] forEachDirtyCell requires a function.");for(let t=0;t<this._lastDirtyCells.length;t+=1){const i=this._lastDirtyCells[t];if(i<0||i>=this._cellCount)continue;const n=i%this._cols,s=i/this._cols|0;e(n,s,this._charBack[i],this._fgBack[i],this._bgBack[i],i)}return this}exportRegion(e,t,i,n){const s=this._clipRegion(e,t,i,n);if(!s)return{x:0,y:0,width:0,height:0,chars:new Uint32Array(0),fg:new Uint32Array(0),bg:new Uint32Array(0)};const{x0:a,y0:o,x1:l,y1:c,width:h,height:d}=s,u=h*d,f=new Uint32Array(u),m=new Uint32Array(u),y=new Uint32Array(u);for(let p=0;p<d;p+=1){const _=this.cellIndex(a,o+p),T=_+h,A=p*h;f.set(this._charBack.subarray(_,T),A),m.set(this._fgBack.subarray(_,T),A),y.set(this._bgBack.subarray(_,T),A)}return{x:a,y:o,width:h,height:d,chars:f,fg:m,bg:y}}toText(e=0,t=0,i=this._cols,n=this._rows){const s=this._clipRegion(e,t,i,n);if(!s)return"";const{x0:a,y0:o,x1:l,y1:c}=s,h=[];for(let d=o;d<c;d+=1){let u="",f=this.cellIndex(a,d);for(let m=a;m<l;m+=1,f+=1)u+=String.fromCodePoint(this._charBack[f]);h.push(u)}return h.join(`
`)}resize(e,t,i=!1){Ws(e,"cols"),Ws(t,"rows");const n=Math.trunc(e),s=Math.trunc(t);if(n===this._cols&&s===this._rows)return i?this.forceSync():this.clear(),this;Ll(n*s);const a=this._cols,o=this._rows,l=this._charBack,c=this._fgBack,h=this._bgBack;if(this._cols=n,this._rows=s,this._cellCount=n*s,this._allocateArrays(),this._resetToDefaults(),i&&l){const d=Math.min(a,n),u=Math.min(o,s);for(let f=0;f<u;f+=1)for(let m=0;m<d;m+=1){const y=f*a+m,p=f*n+m,_=l[y],T=c[y],A=h[y];this._charBack[p]=_,this._fgBack[p]=T,this._bgBack[p]=A,this._charFront[p]=_,this._fgFront[p]=T,this._bgFront[p]=A}}return this._clearDirtyState(),this}_allocateArrays(){this._charBack=new Uint32Array(this._cellCount),this._fgBack=new Uint32Array(this._cellCount),this._bgBack=new Uint32Array(this._cellCount),this._charFront=new Uint32Array(this._cellCount),this._fgFront=new Uint32Array(this._cellCount),this._bgFront=new Uint32Array(this._cellCount),this._dirtyFlags=new Uint8Array(this._cellCount),this._dirtyIndices=[],this._fullDirty=!1,this._dirtyRect=null,this._lastDirtyCells=[]}_resetToDefaults(){this._charBack.fill(this._defaultCharCode),this._fgBack.fill(this._defaultFg),this._bgBack.fill(this._defaultBg),this._charFront.fill(this._defaultCharCode),this._fgFront.fill(this._defaultFg),this._bgFront.fill(this._defaultBg),this._clearDirtyState()}_clearDirtyState(){this._fullDirty=!1,this._dirtyIndices.length=0,this._dirtyFlags&&this._dirtyFlags.fill(0),this._dirtyRect=null,this._lastDirtyCells=[]}_markCandidate(e){this._fullDirty||this._dirtyFlags[e]===0&&(this._dirtyFlags[e]=1,this._dirtyIndices.push(e),this._dirtyIndices.length>this._cellCount&&(this._fullDirty=!0,this._dirtyIndices.length=0,this._dirtyFlags.fill(0)))}_clipRegion(e,t,i,n){if(!Number.isFinite(e)||!Number.isFinite(t)||!Number.isFinite(i)||!Number.isFinite(n))return null;const s=Math.trunc(e),a=Math.trunc(t),o=Math.trunc(i),l=Math.trunc(n);if(o<=0||l<=0)return null;const c=Math.max(0,s),h=Math.max(0,a),d=Math.min(this._cols,s+o),u=Math.min(this._rows,a+l);return c>=d||h>=u?null:{x0:c,y0:h,x1:d,y1:u,width:d-c,height:u-h}}}const wd="'Fira Code', 'Courier New', Courier, monospace",Td=16,Nl=255,Fl=new Set([0,32]);class bd{constructor(e,t=null){if(!e||typeof e.fillText!="function")throw new TypeError("[Renderer] A valid CanvasRenderingContext2D is required.");this._ctx=e,this._canvas=e.canvas;const i=this._measureCanvas();this._cssWidth=(t==null?void 0:t.cssWidth)??i.cssWidth,this._cssHeight=(t==null?void 0:t.cssHeight)??i.cssHeight,this._dpr=(t==null?void 0:t.dpr)??i.dpr;const n=this._canvas.dataset||{};this._fontFamily=n.fontFamily||wd,this._fontSize=parseFloat(n.baseFontSize)||Td,this._cellHeightHint=parseFloat(n.cellHeight)||0,this._cellWidth=this._fontSize,this._cellHeight=this._fontSize,this._textPadY=0,this._configureFont(),this._palette=new Map,this._grayscale=!1,this._grayscaleCache=new Map,this._paletteGeneration=0,this._glDelegate=null,this._overlayMode=!1,this._cssCache=new Map,this._glyphCache=new Map,this._cacheChars=null,this._cacheFg=null,this._cacheBg=null,this._cacheKey=null,this._clearColor=Nl,this._stats={frameCount:0,lastCellsVisited:0,lastCellsDrawn:0,lastGlyphs:0,lastBackgrounds:0,lastStyleChanges:0,lastRenderMs:0},this._applyBaseTransform()}get cellWidth(){return this._cellWidth}get cellHeight(){return this._cellHeight}get fontSize(){return this._fontSize}get devicePixelRatio(){return this._dpr}get viewportWidth(){return this._cssWidth}get viewportHeight(){return this._cssHeight}getViewportGridSize(){return{columns:Math.max(1,Math.ceil(this._cssWidth/this._cellWidth)),rows:Math.max(1,Math.ceil(this._cssHeight/this._cellHeight))}}getStats(){return{...this._stats}}get grayscale(){return this._grayscale}get glDelegate(){return this._glDelegate}get isOverlay(){return this._overlayMode}setGLDelegate(e){const t=e&&e.isSupported===!0&&typeof e.present=="function";return this._glDelegate=t?e:null,this._overlayMode=this._glDelegate!==null,this.invalidate(),this._overlayMode||this.clear(),this}handleResize(e){return this._cssWidth=Math.max(1,Math.floor(e.cssWidth)),this._cssHeight=Math.max(1,Math.floor(e.cssHeight)),this._dpr=e.dpr,this._applyBaseTransform(),this.invalidate(),this}_measureCanvas(){const e=this._canvas.getBoundingClientRect();return{cssWidth:Math.max(1,Math.floor(e.width)),cssHeight:Math.max(1,Math.floor(e.height)),dpr:this._canvas.width>0&&e.width>0?this._canvas.width/e.width:1}}_applyBaseTransform(){this._ctx.setTransform(this._dpr,0,0,this._dpr,0,0)}_configureFont(){const e=this._ctx;e.font=`${this._fontSize}px ${this._fontFamily}`,e.textBaseline="top",e.textAlign="left";const t=e.measureText("M").width;this._cellWidth=Number.isFinite(t)&&t>0?t:this._fontSize*.6,this._cellHeight=this._cellHeightHint>0?Math.max(this._fontSize,this._cellHeightHint):Math.ceil(this._fontSize*1.25),this._textPadY=Math.max(0,Math.floor((this._cellHeight-this._fontSize)/2))}setPalette(e){if(this._palette.clear(),e){const t=e instanceof Map?e.entries():Object.entries(e);for(const[i,n]of t)this._palette.set(i>>>0,n>>>0)}return this._paletteGeneration+=1,this.invalidate(),this}setGrayscale(e){const t=!!e;return t!==this._grayscale&&(this._grayscale=t,this._paletteGeneration+=1,this.invalidate()),this}_resolveColor(e){const t=e>>>0;if(this._palette.size>0&&this._palette.has(t))return this._palette.get(t);if(this._grayscale){const i=this._grayscaleCache.get(t);if(i!==void 0)return i;const{r:n,g:s,b:a,a:o}=Z.unpackColor(t),l=Math.round(.2126*n+.7152*s+.0722*a),c=((l&255)<<24|(l&255)<<16|(l&255)<<8|o&255)>>>0;return this._grayscaleCache.size>4096&&this._grayscaleCache.clear(),this._grayscaleCache.set(t,c),c}return t}_cssColor(e){const t=e>>>0;let i=this._cssCache.get(t);return i===void 0&&(i=Z.colorToCSS(t),this._cssCache.set(t,i)),i}beginFrame(){return this._stats.lastCellsVisited=0,this._stats.lastCellsDrawn=0,this._stats.lastGlyphs=0,this._stats.lastBackgrounds=0,this._stats.lastStyleChanges=0,this._applyBaseTransform(),this._overlayMode&&this._ctx.clearRect(0,0,this._cssWidth,this._cssHeight),this}endFrame(){return this._stats.frameCount+=1,this}invalidate(){return this._cacheKey=null,this}clear(e=null){return e!=null&&(this._clearColor=Z.packColor(e,Nl)),this._ctx.save(),this._applyBaseTransform(),this._ctx.fillStyle=this._cssColor(this._clearColor),this._ctx.fillRect(0,0,this._cssWidth,this._cssHeight),this._ctx.restore(),this.invalidate(),this}render(e,t={}){if(this._glDelegate)try{if(this._glDelegate.present(e,t))return this._stats.frameCount+=1,this}catch(h){console.warn("[Renderer] GPU presenter failed — reverting to Canvas 2D:",h),this.setGLDelegate(null)}const i=performance.now(),n=Math.round(t.x||0),s=Math.round(t.y||0),a=Math.round(t.shakeX||0),o=Math.round(t.shakeY||0),l=t.zoom&&t.zoom>0?t.zoom:1,c=this._buildCacheKey(e,n,s,l);return c!==this._cacheKey?(this._fullRepaint(e,n,s,a,o,l),this._cacheKey=c):this._incrementalRepaint(e,n,s,a,o,l),this._stats.lastRenderMs=performance.now()-i,this}renderDirty(e,t={},i=null){if(this._glDelegate)return this.render(e,t);const n=Math.round(t.x||0),s=Math.round(t.y||0),a=Math.round(t.shakeX||0),o=Math.round(t.shakeY||0),l=t.zoom&&t.zoom>0?t.zoom:1;if(this._buildCacheKey(e,n,s,l)!==this._cacheKey)return this.render(e,t);const h=i??e.getDirtyCells();if(!h||h.length===0)return this;this._ensureScreenCache(e);const d=this._ctx,u=e.cols,f=e.charCodes,m=e.foregroundColors,y=e.backgroundColors;d.save(),d.translate(a,o),d.scale(l,l);for(let p=0;p<h.length;p+=1){const _=h[p];if(_<0||_>=e.cellCount)continue;const T=_%u,A=_/u|0,S=this._cellRect(T,A,n,s);this._rectOverlapsViewport(S,l)&&this._paintCell(d,_,S,f[_],m[_],y[_])}return d.restore(),this}_fullRepaint(e,t,i,n,s,a=1){const o=this._ctx;this._ensureScreenCache(e);const l=this._visibleRange(e,t,i,a),c=e.charCodes,h=e.foregroundColors,d=e.backgroundColors,u=Math.max(Math.abs(n),Math.abs(s))+2;o.save(),o.translate(n,s),o.scale(a,a),o.fillStyle=this._cssColor(this._clearColor),o.fillRect(-u,-u,(this._cssWidth+u*2)/a,(this._cssHeight+u*2)/a),this._stats.lastStyleChanges+=1;const f=new Map,m=new Map;for(let y=l.row0;y<l.row1;y+=1){let p=y*e.cols+l.col0;for(let _=l.col0;_<l.col1;_+=1,p+=1){const T=c[p],A=this._resolveColor(h[p]),S=this._resolveColor(d[p]);this._cacheChars[p]=T,this._cacheFg[p]=A,this._cacheBg[p]=S,this._stats.lastCellsVisited+=1;const M=this._cellRect(_,y,t,i);if(S!==this._clearColor&&S&255){let E=f.get(S);E||(E=new Path2D,f.set(S,E)),E.rect(M.x,M.y,M.w,M.h),this._stats.lastBackgrounds+=1}if(!Fl.has(T)){let E=m.get(A);E||(E=[],m.set(A,E)),E.push({x:M.x,y:M.y+this._textPadY,ch:this._glyphString(T)}),this._stats.lastGlyphs+=1}}}for(const[y,p]of f)o.fillStyle=this._cssColor(y),o.fill(p),this._stats.lastStyleChanges+=1;for(const[y,p]of m){o.fillStyle=this._cssColor(y),this._stats.lastStyleChanges+=1;for(let _=0;_<p.length;_+=1)o.fillText(p[_].ch,p[_].x,p[_].y)}o.restore(),this._stats.lastCellsDrawn=this._stats.lastCellsVisited}_incrementalRepaint(e,t,i,n,s,a=1){const o=this._ctx;this._ensureScreenCache(e);const l=this._visibleRange(e,t,i,a),c=e.charCodes,h=e.foregroundColors,d=e.backgroundColors;o.save(),o.translate(n,s),o.scale(a,a);for(let u=l.row0;u<l.row1;u+=1){let f=u*e.cols+l.col0;for(let m=l.col0;m<l.col1;m+=1,f+=1){const y=c[f],p=this._resolveColor(h[f]),_=this._resolveColor(d[f]);if(this._stats.lastCellsVisited+=1,this._cacheChars[f]===y&&this._cacheFg[f]===p&&this._cacheBg[f]===_)continue;const T=this._cellRect(m,u,t,i);this._paintCell(o,f,T,y,h[f],d[f])}}o.restore()}_paintCell(e,t,i,n,s,a){const o=this._resolveColor(s),l=this._resolveColor(a),c=l!==this._clearColor&&(l&255)!==0;e.fillStyle=this._cssColor(c?l:this._clearColor),e.fillRect(i.x,i.y,i.w,i.h),this._stats.lastBackgrounds+=1,this._stats.lastStyleChanges+=1,Fl.has(n)||(e.fillStyle=this._cssColor(o),e.fillText(this._glyphString(n),i.x,i.y+this._textPadY),this._stats.lastGlyphs+=1,this._stats.lastStyleChanges+=1),this._cacheChars[t]=n,this._cacheFg[t]=o,this._cacheBg[t]=l,this._stats.lastCellsDrawn+=1}_visibleRange(e,t,i,n=1){const s=this._cssWidth/n,a=this._cssHeight/n,o=Math.max(0,Math.floor(t/this._cellWidth)),l=Math.max(0,Math.floor(i/this._cellHeight)),c=Math.min(e.cols,Math.ceil((t+s)/this._cellWidth)),h=Math.min(e.rows,Math.ceil((i+a)/this._cellHeight));return{col0:o,row0:l,col1:c,row1:h}}_cellRect(e,t,i,n){const s=Math.round(e*this._cellWidth-i),a=Math.round((e+1)*this._cellWidth-i),o=Math.round(t*this._cellHeight-n),l=Math.round((t+1)*this._cellHeight-n);return{x:s,y:o,w:a-s,h:l-o}}_rectOverlapsViewport(e,t=1){const i=this._cssWidth/t,n=this._cssHeight/t;return e.x+e.w>0&&e.y+e.h>0&&e.x<i&&e.y<n}_buildCacheKey(e,t,i,n=1){return`${t},${i}|${e.cols}x${e.rows}|p${this._paletteGeneration}|z${n.toFixed(3)}`}_ensureScreenCache(e){this._cacheChars!==null&&this._cacheChars.length===e.cellCount||(this._cacheChars=new Uint32Array(e.cellCount),this._cacheFg=new Uint32Array(e.cellCount),this._cacheBg=new Uint32Array(e.cellCount),this._cacheChars.fill(4294967295),this._cacheKey=null)}_glyphString(e){let t=this._glyphCache.get(e);return t===void 0&&(t=String.fromCodePoint(e),this._glyphCache.size>4096&&this._glyphCache.clear(),this._glyphCache.set(e,t)),t}drawString(e,t,i,n,s=null){if(typeof i!="string"||i.length===0)return{width:0,height:0};const a=this._ctx,o=i.split(/\r?\n/),l=Z.packColor(n,4294967295),c=s==null?null:Z.packColor(s,0);let h=0;for(let f=0;f<o.length;f+=1)o[f].length>h&&(h=o[f].length);const d=h*this._cellWidth,u=o.length*this._cellHeight;a.save(),c!==null&&c&255&&(a.fillStyle=this._cssColor(c),a.fillRect(e,t,Math.ceil(d),u)),a.fillStyle=this._cssColor(l);for(let f=0;f<o.length;f+=1)o[f].length!==0&&a.fillText(o[f],e,t+f*this._cellHeight+this._textPadY);return a.restore(),{width:d,height:u}}drawRect(e,t,i,n,s){const a=Z.packColor(s,4294967295);return a&255?(this._ctx.save(),this._ctx.fillStyle=this._cssColor(a),this._ctx.fillRect(e,t,i,n),this._ctx.restore(),this):this}measureString(e){if(typeof e!="string"||e.length===0)return{width:0,height:0};const t=e.split(/\r?\n/);let i=0;for(let n=0;n<t.length;n+=1)t[n].length>i&&(i=t[n].length);return{width:i*this._cellWidth,height:t.length*this._cellHeight}}}/**
 * @license
 * Copyright 2010-2026 Three.js Authors
 * SPDX-License-Identifier: MIT
 */const Ko="186",Ad=0,Ol=1,Cd=2,Pr=1,Rd=2,ws=3,Cn=0,qt=1,Yi=2,Ki=0,Rs=1,Ul=2,kl=3,Bl=4,Pd=5,Jn=100,Id=101,Dd=102,Ld=103,Nd=104,Fd=200,Od=201,Ud=202,kd=203,du=204,fu=205,Bd=206,Hd=207,Gd=208,zd=209,Wd=210,Vd=211,Xd=212,qd=213,Yd=214,ao=0,oo=1,lo=2,Is=3,co=4,ho=5,uo=6,fo=7,pu=0,$d=1,Kd=2,Ni=0,_u=1,mu=2,gu=3,xu=4,yu=5,vu=6,Su=7,Mu=300,Rn=301,ss=302,la=303,ca=304,jr=306,po=1e3,ii=1001,_o=1002,bt=1003,jd=1004,Vs=1005,Dt=1006,ha=1007,Tn=1008,ti=1009,Eu=1010,wu=1011,Ds=1012,jo=1013,Fi=1014,Di=1015,Oi=1016,Jo=1017,Zo=1018,Ls=1020,Tu=35902,bu=35899,Au=1021,Cu=1022,ci=1023,Qi=1026,bn=1027,Ru=1028,Qo=1029,Pn=1030,el=1031,tl=1033,Ir=33776,Dr=33777,Lr=33778,Nr=33779,mo=35840,go=35841,xo=35842,yo=35843,vo=36196,So=37492,Mo=37496,Eo=37488,wo=37489,kr=37490,To=37491,bo=37808,Ao=37809,Co=37810,Ro=37811,Po=37812,Io=37813,Do=37814,Lo=37815,No=37816,Fo=37817,Oo=37818,Uo=37819,ko=37820,Bo=37821,Ho=36492,Go=36494,zo=36495,Wo=36283,Vo=36284,Br=36285,Xo=36286,Jd=3200,Hl=0,Zd=1,fn="",oi="srgb",Hr="srgb-linear",Gr="linear",nt="srgb",ua=7680,Qd=519,ef=512,tf=513,nf=514,il=515,sf=516,rf=517,nl=518,af=519,of=35044,Gl="300 es",Li=2e3,zr=2001;function lf(r){for(let e=r.length-1;e>=0;--e)if(r[e]>=65535)return!0;return!1}function Wr(r){return document.createElementNS("http://www.w3.org/1999/xhtml",r)}function cf(){const r=Wr("canvas");return r.style.display="block",r}const zl={};function Wl(...r){const e="THREE."+r.shift();console.log(e,...r)}function Pu(r){const e=r[0];if(typeof e=="string"&&e.startsWith("TSL:")){const t=r[1];t&&t.isStackTrace?r[0]+=" "+t.getLocation():r[1]='Stack trace not available. Enable "THREE.Node.captureStackTrace" to capture stack traces.'}return r}function Re(...r){r=Pu(r);const e="THREE."+r.shift();{const t=r[0];t&&t.isStackTrace?console.warn(t.getError(e)):console.warn(e,...r)}}function Ke(...r){r=Pu(r);const e="THREE."+r.shift();{const t=r[0];t&&t.isStackTrace?console.error(t.getError(e)):console.error(e,...r)}}function ts(...r){const e=r.join(" ");e in zl||(zl[e]=!0,Re(...r))}function hf(r,e,t){return new Promise(function(i,n){function s(){switch(r.clientWaitSync(e,r.SYNC_FLUSH_COMMANDS_BIT,0)){case r.WAIT_FAILED:n();break;case r.TIMEOUT_EXPIRED:setTimeout(s,t);break;default:i()}}setTimeout(s,t)})}const uf={[ao]:oo,[lo]:uo,[co]:fo,[Is]:ho,[oo]:ao,[uo]:lo,[fo]:co,[ho]:Is};class Dn{addEventListener(e,t){this._listeners===void 0&&(this._listeners={});const i=this._listeners;i[e]===void 0&&(i[e]=[]),i[e].indexOf(t)===-1&&i[e].push(t)}hasEventListener(e,t){const i=this._listeners;return i===void 0?!1:i[e]!==void 0&&i[e].indexOf(t)!==-1}removeEventListener(e,t){const i=this._listeners;if(i===void 0)return;const n=i[e];if(n!==void 0){const s=n.indexOf(t);s!==-1&&n.splice(s,1)}}dispatchEvent(e){const t=this._listeners;if(t===void 0)return;const i=t[e.type];if(i!==void 0){e.target=this;const n=i.slice(0);for(let s=0,a=n.length;s<a;s++)n[s].call(this,e);e.target=null}}}const Ot=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"],da=Math.PI/180,qo=180/Math.PI;function Os(){const r=Math.random()*4294967295|0,e=Math.random()*4294967295|0,t=Math.random()*4294967295|0,i=Math.random()*4294967295|0;return(Ot[r&255]+Ot[r>>8&255]+Ot[r>>16&255]+Ot[r>>24&255]+"-"+Ot[e&255]+Ot[e>>8&255]+"-"+Ot[e>>16&15|64]+Ot[e>>24&255]+"-"+Ot[t&63|128]+Ot[t>>8&255]+"-"+Ot[t>>16&255]+Ot[t>>24&255]+Ot[i&255]+Ot[i>>8&255]+Ot[i>>16&255]+Ot[i>>24&255]).toLowerCase()}function Ve(r,e,t){return Math.max(e,Math.min(t,r))}function df(r,e){return(r%e+e)%e}function fa(r,e,t){return(1-t)*r+t*e}function ls(r,e){switch(e.constructor){case Float32Array:return r;case Uint32Array:return r/4294967295;case Uint16Array:return r/65535;case Uint8Array:case Uint8ClampedArray:return r/255;case Int32Array:return Math.max(r/2147483647,-1);case Int16Array:return Math.max(r/32767,-1);case Int8Array:return Math.max(r/127,-1);default:throw new Error("THREE.MathUtils: Invalid component type.")}}function zt(r,e){switch(e.constructor){case Float32Array:return r;case Uint32Array:return Math.round(r*4294967295);case Uint16Array:return Math.round(r*65535);case Uint8Array:case Uint8ClampedArray:return Math.round(r*255);case Int32Array:return Math.round(r*2147483647);case Int16Array:return Math.round(r*32767);case Int8Array:return Math.round(r*127);default:throw new Error("THREE.MathUtils: Invalid component type.")}}const ll=class ll{constructor(e=0,t=0){this.x=e,this.y=t}get width(){return this.x}set width(e){this.x=e}get height(){return this.y}set height(e){this.y=e}set(e,t){return this.x=e,this.y=t,this}setScalar(e){return this.x=e,this.y=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;default:throw new Error("THREE.Vector2: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;default:throw new Error("THREE.Vector2: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y)}copy(e){return this.x=e.x,this.y=e.y,this}add(e){return this.x+=e.x,this.y+=e.y,this}addScalar(e){return this.x+=e,this.y+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this}subScalar(e){return this.x-=e,this.y-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this}multiply(e){return this.x*=e.x,this.y*=e.y,this}multiplyScalar(e){return this.x*=e,this.y*=e,this}divide(e){return this.x/=e.x,this.y/=e.y,this}divideScalar(e){return this.multiplyScalar(1/e)}applyMatrix3(e){const t=this.x,i=this.y,n=e.elements;return this.x=n[0]*t+n[3]*i+n[6],this.y=n[1]*t+n[4]*i+n[7],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this}clamp(e,t){return this.x=Ve(this.x,e.x,t.x),this.y=Ve(this.y,e.y,t.y),this}clampScalar(e,t){return this.x=Ve(this.x,e,t),this.y=Ve(this.y,e,t),this}clampLength(e,t){const i=this.length();return this.divideScalar(i||1).multiplyScalar(Ve(i,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(e){return this.x*e.x+this.y*e.y}cross(e){return this.x*e.y-this.y*e.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(e){const t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;const i=this.dot(e)/t;return Math.acos(Ve(i,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){const t=this.x-e.x,i=this.y-e.y;return t*t+i*i}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this}lerpVectors(e,t,i){return this.x=e.x+(t.x-e.x)*i,this.y=e.y+(t.y-e.y)*i,this}equals(e){return e.x===this.x&&e.y===this.y}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this}rotateAround(e,t){const i=Math.cos(t),n=Math.sin(t),s=this.x-e.x,a=this.y-e.y;return this.x=s*i-a*n+e.x,this.y=s*n+a*i+e.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}};ll.prototype.isVector2=!0;let Ge=ll;class as{constructor(e=0,t=0,i=0,n=1){this.isQuaternion=!0,this._x=e,this._y=t,this._z=i,this._w=n}static slerpFlat(e,t,i,n,s,a,o){let l=i[n+0],c=i[n+1],h=i[n+2],d=i[n+3],u=s[a+0],f=s[a+1],m=s[a+2],y=s[a+3];if(d!==y||l!==u||c!==f||h!==m){let p=l*u+c*f+h*m+d*y;p<0&&(u=-u,f=-f,m=-m,y=-y,p=-p);let _=1-o;if(p<.9995){const T=Math.acos(p),A=Math.sin(T);_=Math.sin(_*T)/A,o=Math.sin(o*T)/A,l=l*_+u*o,c=c*_+f*o,h=h*_+m*o,d=d*_+y*o}else{l=l*_+u*o,c=c*_+f*o,h=h*_+m*o,d=d*_+y*o;const T=1/Math.sqrt(l*l+c*c+h*h+d*d);l*=T,c*=T,h*=T,d*=T}}e[t]=l,e[t+1]=c,e[t+2]=h,e[t+3]=d}static multiplyQuaternionsFlat(e,t,i,n,s,a){const o=i[n],l=i[n+1],c=i[n+2],h=i[n+3],d=s[a],u=s[a+1],f=s[a+2],m=s[a+3];return e[t]=o*m+h*d+l*f-c*u,e[t+1]=l*m+h*u+c*d-o*f,e[t+2]=c*m+h*f+o*u-l*d,e[t+3]=h*m-o*d-l*u-c*f,e}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get w(){return this._w}set w(e){this._w=e,this._onChangeCallback()}set(e,t,i,n){return this._x=e,this._y=t,this._z=i,this._w=n,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this._onChangeCallback(),this}setFromEuler(e,t=!0){const i=e._x,n=e._y,s=e._z,a=e._order,o=Math.cos,l=Math.sin,c=o(i/2),h=o(n/2),d=o(s/2),u=l(i/2),f=l(n/2),m=l(s/2);switch(a){case"XYZ":this._x=u*h*d+c*f*m,this._y=c*f*d-u*h*m,this._z=c*h*m+u*f*d,this._w=c*h*d-u*f*m;break;case"YXZ":this._x=u*h*d+c*f*m,this._y=c*f*d-u*h*m,this._z=c*h*m-u*f*d,this._w=c*h*d+u*f*m;break;case"ZXY":this._x=u*h*d-c*f*m,this._y=c*f*d+u*h*m,this._z=c*h*m+u*f*d,this._w=c*h*d-u*f*m;break;case"ZYX":this._x=u*h*d-c*f*m,this._y=c*f*d+u*h*m,this._z=c*h*m-u*f*d,this._w=c*h*d+u*f*m;break;case"YZX":this._x=u*h*d+c*f*m,this._y=c*f*d+u*h*m,this._z=c*h*m-u*f*d,this._w=c*h*d-u*f*m;break;case"XZY":this._x=u*h*d-c*f*m,this._y=c*f*d-u*h*m,this._z=c*h*m+u*f*d,this._w=c*h*d+u*f*m;break;default:Re("Quaternion: .setFromEuler() encountered an unknown order: "+a)}return t===!0&&this._onChangeCallback(),this}setFromAxisAngle(e,t){const i=t/2,n=Math.sin(i);return this._x=e.x*n,this._y=e.y*n,this._z=e.z*n,this._w=Math.cos(i),this._onChangeCallback(),this}setFromRotationMatrix(e){const t=e.elements,i=t[0],n=t[4],s=t[8],a=t[1],o=t[5],l=t[9],c=t[2],h=t[6],d=t[10],u=i+o+d;if(u>0){const f=.5/Math.sqrt(u+1);this._w=.25/f,this._x=(h-l)*f,this._y=(s-c)*f,this._z=(a-n)*f}else if(i>o&&i>d){const f=2*Math.sqrt(1+i-o-d);this._w=(h-l)/f,this._x=.25*f,this._y=(n+a)/f,this._z=(s+c)/f}else if(o>d){const f=2*Math.sqrt(1+o-i-d);this._w=(s-c)/f,this._x=(n+a)/f,this._y=.25*f,this._z=(l+h)/f}else{const f=2*Math.sqrt(1+d-i-o);this._w=(a-n)/f,this._x=(s+c)/f,this._y=(l+h)/f,this._z=.25*f}return this._onChangeCallback(),this}setFromUnitVectors(e,t){let i=e.dot(t)+1;return i<1e-8?(i=0,Math.abs(e.x)>Math.abs(e.z)?(this._x=-e.y,this._y=e.x,this._z=0,this._w=i):(this._x=0,this._y=-e.z,this._z=e.y,this._w=i)):(this._x=e.y*t.z-e.z*t.y,this._y=e.z*t.x-e.x*t.z,this._z=e.x*t.y-e.y*t.x,this._w=i),this.normalize()}angleTo(e){return 2*Math.acos(Math.abs(Ve(this.dot(e),-1,1)))}rotateTowards(e,t){const i=this.angleTo(e);if(i===0)return this;const n=Math.min(1,t/i);return this.slerp(e,n),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let e=this.length();return e===0?(this._x=0,this._y=0,this._z=0,this._w=1):(e=1/e,this._x=this._x*e,this._y=this._y*e,this._z=this._z*e,this._w=this._w*e),this._onChangeCallback(),this}multiply(e){return this.multiplyQuaternions(this,e)}premultiply(e){return this.multiplyQuaternions(e,this)}multiplyQuaternions(e,t){const i=e._x,n=e._y,s=e._z,a=e._w,o=t._x,l=t._y,c=t._z,h=t._w;return this._x=i*h+a*o+n*c-s*l,this._y=n*h+a*l+s*o-i*c,this._z=s*h+a*c+i*l-n*o,this._w=a*h-i*o-n*l-s*c,this._onChangeCallback(),this}slerp(e,t){let i=e._x,n=e._y,s=e._z,a=e._w,o=this.dot(e);o<0&&(i=-i,n=-n,s=-s,a=-a,o=-o);let l=1-t;if(o<.9995){const c=Math.acos(o),h=Math.sin(c);l=Math.sin(l*c)/h,t=Math.sin(t*c)/h,this._x=this._x*l+i*t,this._y=this._y*l+n*t,this._z=this._z*l+s*t,this._w=this._w*l+a*t,this._onChangeCallback()}else this._x=this._x*l+i*t,this._y=this._y*l+n*t,this._z=this._z*l+s*t,this._w=this._w*l+a*t,this.normalize();return this}slerpQuaternions(e,t,i){return this.copy(e).slerp(t,i)}random(){const e=2*Math.PI*Math.random(),t=2*Math.PI*Math.random(),i=Math.random(),n=Math.sqrt(1-i),s=Math.sqrt(i);return this.set(n*Math.sin(e),n*Math.cos(e),s*Math.sin(t),s*Math.cos(t))}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w}fromArray(e,t=0){return this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e}fromBufferAttribute(e,t){return this._x=e.getX(t),this._y=e.getY(t),this._z=e.getZ(t),this._w=e.getW(t),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}}const cl=class cl{constructor(e=0,t=0,i=0){this.x=e,this.y=t,this.z=i}set(e,t,i){return i===void 0&&(i=this.z),this.x=e,this.y=t,this.z=i,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;default:throw new Error("THREE.Vector3: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("THREE.Vector3: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this}multiplyVectors(e,t){return this.x=e.x*t.x,this.y=e.y*t.y,this.z=e.z*t.z,this}applyEuler(e){return this.applyQuaternion(Vl.setFromEuler(e))}applyAxisAngle(e,t){return this.applyQuaternion(Vl.setFromAxisAngle(e,t))}applyMatrix3(e){const t=this.x,i=this.y,n=this.z,s=e.elements;return this.x=s[0]*t+s[3]*i+s[6]*n,this.y=s[1]*t+s[4]*i+s[7]*n,this.z=s[2]*t+s[5]*i+s[8]*n,this}applyNormalMatrix(e){return this.applyMatrix3(e).normalize()}applyMatrix4(e){const t=this.x,i=this.y,n=this.z,s=e.elements,a=1/(s[3]*t+s[7]*i+s[11]*n+s[15]);return this.x=(s[0]*t+s[4]*i+s[8]*n+s[12])*a,this.y=(s[1]*t+s[5]*i+s[9]*n+s[13])*a,this.z=(s[2]*t+s[6]*i+s[10]*n+s[14])*a,this}applyQuaternion(e){const t=this.x,i=this.y,n=this.z,s=e.x,a=e.y,o=e.z,l=e.w,c=2*(a*n-o*i),h=2*(o*t-s*n),d=2*(s*i-a*t);return this.x=t+l*c+a*d-o*h,this.y=i+l*h+o*c-s*d,this.z=n+l*d+s*h-a*c,this}project(e){return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix)}unproject(e){return this.applyMatrix4(e.projectionMatrixInverse).applyMatrix4(e.matrixWorld)}transformDirection(e){const t=this.x,i=this.y,n=this.z,s=e.elements;return this.x=s[0]*t+s[4]*i+s[8]*n,this.y=s[1]*t+s[5]*i+s[9]*n,this.z=s[2]*t+s[6]*i+s[10]*n,this.normalize()}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this}divideScalar(e){return this.multiplyScalar(1/e)}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this}clamp(e,t){return this.x=Ve(this.x,e.x,t.x),this.y=Ve(this.y,e.y,t.y),this.z=Ve(this.z,e.z,t.z),this}clampScalar(e,t){return this.x=Ve(this.x,e,t),this.y=Ve(this.y,e,t),this.z=Ve(this.z,e,t),this}clampLength(e,t){const i=this.length();return this.divideScalar(i||1).multiplyScalar(Ve(i,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this}lerpVectors(e,t,i){return this.x=e.x+(t.x-e.x)*i,this.y=e.y+(t.y-e.y)*i,this.z=e.z+(t.z-e.z)*i,this}cross(e){return this.crossVectors(this,e)}crossVectors(e,t){const i=e.x,n=e.y,s=e.z,a=t.x,o=t.y,l=t.z;return this.x=n*l-s*o,this.y=s*a-i*l,this.z=i*o-n*a,this}projectOnVector(e){const t=e.lengthSq();if(t===0)return this.set(0,0,0);const i=e.dot(this)/t;return this.copy(e).multiplyScalar(i)}projectOnPlane(e){return pa.copy(this).projectOnVector(e),this.sub(pa)}reflect(e){return this.sub(pa.copy(e).multiplyScalar(2*this.dot(e)))}angleTo(e){const t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;const i=this.dot(e)/t;return Math.acos(Ve(i,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){const t=this.x-e.x,i=this.y-e.y,n=this.z-e.z;return t*t+i*i+n*n}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)+Math.abs(this.z-e.z)}setFromSpherical(e){return this.setFromSphericalCoords(e.radius,e.phi,e.theta)}setFromSphericalCoords(e,t,i){const n=Math.sin(t)*e;return this.x=n*Math.sin(i),this.y=Math.cos(t)*e,this.z=n*Math.cos(i),this}setFromCylindrical(e){return this.setFromCylindricalCoords(e.radius,e.theta,e.y)}setFromCylindricalCoords(e,t,i){return this.x=e*Math.sin(t),this.y=i,this.z=e*Math.cos(t),this}setFromMatrixPosition(e){const t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this}setFromMatrixScale(e){const t=this.setFromMatrixColumn(e,0).length(),i=this.setFromMatrixColumn(e,1).length(),n=this.setFromMatrixColumn(e,2).length();return this.x=t,this.y=i,this.z=n,this}setFromMatrixColumn(e,t){return this.fromArray(e.elements,t*4)}setFromMatrix3Column(e,t){return this.fromArray(e.elements,t*3)}setFromEuler(e){return this.x=e._x,this.y=e._y,this.z=e._z,this}setFromColor(e){return this.x=e.r,this.y=e.g,this.z=e.b,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){const e=Math.random()*Math.PI*2,t=Math.random()*2-1,i=Math.sqrt(1-t*t);return this.x=i*Math.cos(e),this.y=t,this.z=i*Math.sin(e),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}};cl.prototype.isVector3=!0;let z=cl;const pa=new z,Vl=new as,hl=class hl{constructor(e,t,i,n,s,a,o,l,c){this.elements=[1,0,0,0,1,0,0,0,1],e!==void 0&&this.set(e,t,i,n,s,a,o,l,c)}set(e,t,i,n,s,a,o,l,c){const h=this.elements;return h[0]=e,h[1]=n,h[2]=o,h[3]=t,h[4]=s,h[5]=l,h[6]=i,h[7]=a,h[8]=c,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(e){const t=this.elements,i=e.elements;return t[0]=i[0],t[1]=i[1],t[2]=i[2],t[3]=i[3],t[4]=i[4],t[5]=i[5],t[6]=i[6],t[7]=i[7],t[8]=i[8],this}extractBasis(e,t,i){return e.setFromMatrix3Column(this,0),t.setFromMatrix3Column(this,1),i.setFromMatrix3Column(this,2),this}setFromMatrix4(e){const t=e.elements;return this.set(t[0],t[4],t[8],t[1],t[5],t[9],t[2],t[6],t[10]),this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){const i=e.elements,n=t.elements,s=this.elements,a=i[0],o=i[3],l=i[6],c=i[1],h=i[4],d=i[7],u=i[2],f=i[5],m=i[8],y=n[0],p=n[3],_=n[6],T=n[1],A=n[4],S=n[7],M=n[2],E=n[5],C=n[8];return s[0]=a*y+o*T+l*M,s[3]=a*p+o*A+l*E,s[6]=a*_+o*S+l*C,s[1]=c*y+h*T+d*M,s[4]=c*p+h*A+d*E,s[7]=c*_+h*S+d*C,s[2]=u*y+f*T+m*M,s[5]=u*p+f*A+m*E,s[8]=u*_+f*S+m*C,this}multiplyScalar(e){const t=this.elements;return t[0]*=e,t[3]*=e,t[6]*=e,t[1]*=e,t[4]*=e,t[7]*=e,t[2]*=e,t[5]*=e,t[8]*=e,this}determinant(){const e=this.elements,t=e[0],i=e[1],n=e[2],s=e[3],a=e[4],o=e[5],l=e[6],c=e[7],h=e[8];return t*a*h-t*o*c-i*s*h+i*o*l+n*s*c-n*a*l}invert(){const e=this.elements,t=e[0],i=e[1],n=e[2],s=e[3],a=e[4],o=e[5],l=e[6],c=e[7],h=e[8],d=h*a-o*c,u=o*l-h*s,f=c*s-a*l,m=t*d+i*u+n*f;if(m===0)return this.set(0,0,0,0,0,0,0,0,0);const y=1/m;return e[0]=d*y,e[1]=(n*c-h*i)*y,e[2]=(o*i-n*a)*y,e[3]=u*y,e[4]=(h*t-n*l)*y,e[5]=(n*s-o*t)*y,e[6]=f*y,e[7]=(i*l-c*t)*y,e[8]=(a*t-i*s)*y,this}transpose(){let e;const t=this.elements;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this}getNormalMatrix(e){return this.setFromMatrix4(e).invert().transpose()}transposeIntoArray(e){const t=this.elements;return e[0]=t[0],e[1]=t[3],e[2]=t[6],e[3]=t[1],e[4]=t[4],e[5]=t[7],e[6]=t[2],e[7]=t[5],e[8]=t[8],this}setUvTransform(e,t,i,n,s,a,o){const l=Math.cos(s),c=Math.sin(s);return this.set(i*l,i*c,-i*(l*a+c*o)+a+e,-n*c,n*l,-n*(-c*a+l*o)+o+t,0,0,1),this}scale(e,t){return ts("Matrix3: .scale() is deprecated. Use .makeScale() instead."),this.premultiply(_a.makeScale(e,t)),this}rotate(e){return ts("Matrix3: .rotate() is deprecated. Use .makeRotation() instead."),this.premultiply(_a.makeRotation(-e)),this}translate(e,t){return ts("Matrix3: .translate() is deprecated. Use .makeTranslation() instead."),this.premultiply(_a.makeTranslation(e,t)),this}makeTranslation(e,t){return e.isVector2?this.set(1,0,e.x,0,1,e.y,0,0,1):this.set(1,0,e,0,1,t,0,0,1),this}makeRotation(e){const t=Math.cos(e),i=Math.sin(e);return this.set(t,-i,0,i,t,0,0,0,1),this}makeScale(e,t){return this.set(e,0,0,0,t,0,0,0,1),this}equals(e){const t=this.elements,i=e.elements;for(let n=0;n<9;n++)if(t[n]!==i[n])return!1;return!0}fromArray(e,t=0){for(let i=0;i<9;i++)this.elements[i]=e[i+t];return this}toArray(e=[],t=0){const i=this.elements;return e[t]=i[0],e[t+1]=i[1],e[t+2]=i[2],e[t+3]=i[3],e[t+4]=i[4],e[t+5]=i[5],e[t+6]=i[6],e[t+7]=i[7],e[t+8]=i[8],e}clone(){return new this.constructor().fromArray(this.elements)}};hl.prototype.isMatrix3=!0;let Ie=hl;const _a=new Ie,Xl=new Ie().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),ql=new Ie().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function ff(){const r={enabled:!0,workingColorSpace:Hr,spaces:{},convert:function(n,s,a){return this.enabled===!1||s===a||!s||!a||(this.spaces[s].transfer===nt&&(n.r=ji(n.r),n.g=ji(n.g),n.b=ji(n.b)),this.spaces[s].primaries!==this.spaces[a].primaries&&(n.applyMatrix3(this.spaces[s].toXYZ),n.applyMatrix3(this.spaces[a].fromXYZ)),this.spaces[a].transfer===nt&&(n.r=is(n.r),n.g=is(n.g),n.b=is(n.b))),n},workingToColorSpace:function(n,s){return this.convert(n,this.workingColorSpace,s)},colorSpaceToWorking:function(n,s){return this.convert(n,s,this.workingColorSpace)},getPrimaries:function(n){return this.spaces[n].primaries},getTransfer:function(n){return n===fn?Gr:this.spaces[n].transfer},getToneMappingMode:function(n){return this.spaces[n].outputColorSpaceConfig.toneMappingMode||"standard"},getLuminanceCoefficients:function(n,s=this.workingColorSpace){return n.fromArray(this.spaces[s].luminanceCoefficients)},define:function(n){Object.assign(this.spaces,n)},_getMatrix:function(n,s,a){return n.copy(this.spaces[s].toXYZ).multiply(this.spaces[a].fromXYZ)},_getDrawingBufferColorSpace:function(n){return this.spaces[n].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(n=this.workingColorSpace){return this.spaces[n].workingColorSpaceConfig.unpackColorSpace},fromWorkingColorSpace:function(n,s){return ts("ColorManagement: .fromWorkingColorSpace() has been renamed to .workingToColorSpace()."),r.workingToColorSpace(n,s)},toWorkingColorSpace:function(n,s){return ts("ColorManagement: .toWorkingColorSpace() has been renamed to .colorSpaceToWorking()."),r.colorSpaceToWorking(n,s)}},e=[.64,.33,.3,.6,.15,.06],t=[.2126,.7152,.0722],i=[.3127,.329];return r.define({[Hr]:{primaries:e,whitePoint:i,transfer:Gr,toXYZ:Xl,fromXYZ:ql,luminanceCoefficients:t,workingColorSpaceConfig:{unpackColorSpace:oi},outputColorSpaceConfig:{drawingBufferColorSpace:oi}},[oi]:{primaries:e,whitePoint:i,transfer:nt,toXYZ:Xl,fromXYZ:ql,luminanceCoefficients:t,outputColorSpaceConfig:{drawingBufferColorSpace:oi}}}),r}const We=ff();function ji(r){return r<.04045?r*.0773993808:Math.pow(r*.9478672986+.0521327014,2.4)}function is(r){return r<.0031308?r*12.92:1.055*Math.pow(r,.41666)-.055}let Fn;class pf{static getDataURL(e,t="image/png"){if(/^data:/i.test(e.src)||typeof HTMLCanvasElement>"u")return e.src;let i;if(e instanceof HTMLCanvasElement)i=e;else{Fn===void 0&&(Fn=Wr("canvas")),Fn.width=e.width,Fn.height=e.height;const n=Fn.getContext("2d");e instanceof ImageData?n.putImageData(e,0,0):n.drawImage(e,0,0,e.width,e.height),i=Fn}return i.toDataURL(t)}static sRGBToLinear(e){if(typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&e instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&e instanceof ImageBitmap){const t=Wr("canvas");t.width=e.width,t.height=e.height;const i=t.getContext("2d");i.drawImage(e,0,0,e.width,e.height);const n=i.getImageData(0,0,e.width,e.height),s=n.data;for(let a=0;a<s.length;a++)s[a]=ji(s[a]/255)*255;return i.putImageData(n,0,0),t}else if(e.data){const t=e.data.slice(0);for(let i=0;i<t.length;i++)t instanceof Uint8Array||t instanceof Uint8ClampedArray?t[i]=Math.floor(ji(t[i]/255)*255):t[i]=ji(t[i]);return{data:t,width:e.width,height:e.height}}else return Re("ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),e}}let _f=0;class sl{constructor(e=null){this.isTextureSource=!0,Object.defineProperty(this,"id",{value:_f++}),this.uuid=Os(),this.data=e,this.dataReady=!0,this.version=0}getSize(e){const t=this.data;return typeof HTMLVideoElement<"u"&&t instanceof HTMLVideoElement?e.set(t.videoWidth,t.videoHeight,0):typeof VideoFrame<"u"&&t instanceof VideoFrame?e.set(t.displayWidth,t.displayHeight,0):t!==null?e.set(t.width,t.height,t.depth||0):e.set(0,0,0),e}set needsUpdate(e){e===!0&&this.version++}toJSON(e){const t=e===void 0||typeof e=="string";if(!t&&e.images[this.uuid]!==void 0)return e.images[this.uuid];const i={uuid:this.uuid,url:""},n=this.data;if(n!==null){let s;if(Array.isArray(n)){s=[];for(let a=0,o=n.length;a<o;a++)n[a].isDataTexture?s.push(ma(n[a].image)):s.push(ma(n[a]))}else s=ma(n);i.url=s}return t||(e.images[this.uuid]=i),i}}function ma(r){return typeof HTMLImageElement<"u"&&r instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&r instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&r instanceof ImageBitmap?pf.getDataURL(r):r.data?{data:Array.from(r.data),width:r.width,height:r.height,type:r.data.constructor.name}:(Re("Texture: Unable to serialize Texture."),{})}let mf=0;const ga=new z;class kt extends Dn{constructor(e=kt.DEFAULT_IMAGE,t=kt.DEFAULT_MAPPING,i=ii,n=ii,s=Dt,a=Tn,o=ci,l=ti,c=kt.DEFAULT_ANISOTROPY,h=fn){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:mf++}),this.uuid=Os(),this.name="",this.source=new sl(e),this.mipmaps=[],this.mapping=t,this.channel=0,this.wrapS=i,this.wrapT=n,this.magFilter=s,this.minFilter=a,this.anisotropy=c,this.format=o,this.internalFormat=null,this.type=l,this.offset=new Ge(0,0),this.repeat=new Ge(1,1),this.center=new Ge(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new Ie,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=h,this.userData={},this.updateRanges=[],this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.isArrayTexture=!!(e&&e.depth&&e.depth>1),this.pmremVersion=0,this.normalized=!1}get width(){return this.source.getSize(ga).x}get height(){return this.source.getSize(ga).y}get depth(){return this.source.getSize(ga).z}get image(){return this.source.data}set image(e){this.source.data=e}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}clone(){return new this.constructor().copy(this)}copy(e){return this.name=e.name,this.source=e.source,this.mipmaps=e.mipmaps.slice(0),this.mapping=e.mapping,this.channel=e.channel,this.wrapS=e.wrapS,this.wrapT=e.wrapT,this.magFilter=e.magFilter,this.minFilter=e.minFilter,this.anisotropy=e.anisotropy,this.format=e.format,this.internalFormat=e.internalFormat,this.type=e.type,this.normalized=e.normalized,this.offset.copy(e.offset),this.repeat.copy(e.repeat),this.center.copy(e.center),this.rotation=e.rotation,this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrix.copy(e.matrix),this.generateMipmaps=e.generateMipmaps,this.premultiplyAlpha=e.premultiplyAlpha,this.flipY=e.flipY,this.unpackAlignment=e.unpackAlignment,this.colorSpace=e.colorSpace,this.renderTarget=e.renderTarget,this.isRenderTargetTexture=e.isRenderTargetTexture,this.isArrayTexture=e.isArrayTexture,this.userData=JSON.parse(JSON.stringify(e.userData)),this.needsUpdate=!0,this}setValues(e){for(const t in e){const i=e[t];if(i===void 0){Re(`Texture.setValues(): parameter '${t}' has value of undefined.`);continue}const n=this[t];if(n===void 0){Re(`Texture.setValues(): property '${t}' does not exist.`);continue}n&&i&&n.isVector2&&i.isVector2||n&&i&&n.isVector3&&i.isVector3||n&&i&&n.isMatrix3&&i.isMatrix3?n.copy(i):this[t]=i}}toJSON(e){const t=e===void 0||typeof e=="string";if(!t&&e.textures[this.uuid]!==void 0)return e.textures[this.uuid];const i={metadata:{version:4.7,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(e).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,normalized:this.normalized,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(i.userData=this.userData),t||(e.textures[this.uuid]=i),i}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(e){if(this.mapping!==Mu)return e;if(e.applyMatrix3(this.matrix),e.x<0||e.x>1)switch(this.wrapS){case po:e.x=e.x-Math.floor(e.x);break;case ii:e.x=e.x<0?0:1;break;case _o:Math.abs(Math.floor(e.x)%2)===1?e.x=Math.ceil(e.x)-e.x:e.x=e.x-Math.floor(e.x);break}if(e.y<0||e.y>1)switch(this.wrapT){case po:e.y=e.y-Math.floor(e.y);break;case ii:e.y=e.y<0?0:1;break;case _o:Math.abs(Math.floor(e.y)%2)===1?e.y=Math.ceil(e.y)-e.y:e.y=e.y-Math.floor(e.y);break}return this.flipY&&(e.y=1-e.y),e}set needsUpdate(e){e===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(e){e===!0&&this.pmremVersion++}}kt.DEFAULT_IMAGE=null;kt.DEFAULT_MAPPING=Mu;kt.DEFAULT_ANISOTROPY=1;const ul=class ul{constructor(e=0,t=0,i=0,n=1){this.x=e,this.y=t,this.z=i,this.w=n}get width(){return this.z}set width(e){this.z=e}get height(){return this.w}set height(e){this.w=e}set(e,t,i,n){return this.x=e,this.y=t,this.z=i,this.w=n,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this.w=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setW(e){return this.w=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;case 3:this.w=t;break;default:throw new Error("THREE.Vector4: index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("THREE.Vector4: index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this.w=e.w!==void 0?e.w:1,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this.w+=e.w,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this.w+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this.w=e.w+t.w,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this.w+=e.w*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this.w-=e.w,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this.w-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this.w=e.w-t.w,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this.w*=e.w,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this.w*=e,this}applyMatrix4(e){const t=this.x,i=this.y,n=this.z,s=this.w,a=e.elements;return this.x=a[0]*t+a[4]*i+a[8]*n+a[12]*s,this.y=a[1]*t+a[5]*i+a[9]*n+a[13]*s,this.z=a[2]*t+a[6]*i+a[10]*n+a[14]*s,this.w=a[3]*t+a[7]*i+a[11]*n+a[15]*s,this}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this.w/=e.w,this}divideScalar(e){return this.multiplyScalar(1/e)}setAxisAngleFromQuaternion(e){this.w=2*Math.acos(e.w);const t=Math.sqrt(1-e.w*e.w);return t<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=e.x/t,this.y=e.y/t,this.z=e.z/t),this}setAxisAngleFromRotationMatrix(e){let t,i,n,s;const l=e.elements,c=l[0],h=l[4],d=l[8],u=l[1],f=l[5],m=l[9],y=l[2],p=l[6],_=l[10];if(Math.abs(h-u)<.01&&Math.abs(d-y)<.01&&Math.abs(m-p)<.01){if(Math.abs(h+u)<.1&&Math.abs(d+y)<.1&&Math.abs(m+p)<.1&&Math.abs(c+f+_-3)<.1)return this.set(1,0,0,0),this;t=Math.PI;const A=(c+1)/2,S=(f+1)/2,M=(_+1)/2,E=(h+u)/4,C=(d+y)/4,g=(m+p)/4;return A>S&&A>M?A<.01?(i=0,n=.707106781,s=.707106781):(i=Math.sqrt(A),n=E/i,s=C/i):S>M?S<.01?(i=.707106781,n=0,s=.707106781):(n=Math.sqrt(S),i=E/n,s=g/n):M<.01?(i=.707106781,n=.707106781,s=0):(s=Math.sqrt(M),i=C/s,n=g/s),this.set(i,n,s,t),this}let T=Math.sqrt((p-m)*(p-m)+(d-y)*(d-y)+(u-h)*(u-h));return Math.abs(T)<.001&&(T=1),this.x=(p-m)/T,this.y=(d-y)/T,this.z=(u-h)/T,this.w=Math.acos((c+f+_-1)/2),this}setFromMatrixPosition(e){const t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this.w=t[15],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this.w=Math.min(this.w,e.w),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this.w=Math.max(this.w,e.w),this}clamp(e,t){return this.x=Ve(this.x,e.x,t.x),this.y=Ve(this.y,e.y,t.y),this.z=Ve(this.z,e.z,t.z),this.w=Ve(this.w,e.w,t.w),this}clampScalar(e,t){return this.x=Ve(this.x,e,t),this.y=Ve(this.y,e,t),this.z=Ve(this.z,e,t),this.w=Ve(this.w,e,t),this}clampLength(e,t){const i=this.length();return this.divideScalar(i||1).multiplyScalar(Ve(i,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z+this.w*e.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this.w+=(e.w-this.w)*t,this}lerpVectors(e,t,i){return this.x=e.x+(t.x-e.x)*i,this.y=e.y+(t.y-e.y)*i,this.z=e.z+(t.z-e.z)*i,this.w=e.w+(t.w-e.w)*i,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z&&e.w===this.w}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this.w=e[t+3],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e[t+3]=this.w,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this.w=e.getW(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}};ul.prototype.isVector4=!0;let xt=ul;class gf extends Dn{constructor(e=1,t=1,i={}){super(),i=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:Dt,depthBuffer:!0,stencilBuffer:!1,resolveColorBuffer:!0,resolveDepthBuffer:!0,resolveStencilBuffer:!0,storeMultisampledColorBuffer:!0,storeMultisampledDepthBuffer:!0,storeMultisampledStencilBuffer:!0,depthTexture:null,samples:0,count:1,depth:1,multiview:!1,useArrayDepthTexture:!1},i),this.isRenderTarget=!0,this.width=e,this.height=t,this.depth=i.depth,this.scissor=new xt(0,0,e,t),this.scissorTest=!1,this.viewport=new xt(0,0,e,t),this.textures=[];const n={width:e,height:t,depth:i.depth},s=new kt(n),a=i.count;for(let o=0;o<a;o++)this.textures[o]=s.clone(),this.textures[o].isRenderTargetTexture=!0,this.textures[o].renderTarget=this;this._setTextureOptions(i),this.depthBuffer=i.depthBuffer,this.stencilBuffer=i.stencilBuffer,this.resolveColorBuffer=i.resolveColorBuffer,this.resolveDepthBuffer=i.resolveDepthBuffer,this.resolveStencilBuffer=i.resolveStencilBuffer,this.storeMultisampledColorBuffer=i.storeMultisampledColorBuffer,this.storeMultisampledDepthBuffer=i.storeMultisampledDepthBuffer,this.storeMultisampledStencilBuffer=i.storeMultisampledStencilBuffer,this._depthTexture=null,this.depthTexture=i.depthTexture,this.samples=i.samples,this.multiview=i.multiview,this.useArrayDepthTexture=i.useArrayDepthTexture}_setTextureOptions(e={}){const t={minFilter:Dt,generateMipmaps:!1,flipY:!1,internalFormat:null};e.mapping!==void 0&&(t.mapping=e.mapping),e.wrapS!==void 0&&(t.wrapS=e.wrapS),e.wrapT!==void 0&&(t.wrapT=e.wrapT),e.wrapR!==void 0&&(t.wrapR=e.wrapR),e.magFilter!==void 0&&(t.magFilter=e.magFilter),e.minFilter!==void 0&&(t.minFilter=e.minFilter),e.format!==void 0&&(t.format=e.format),e.type!==void 0&&(t.type=e.type),e.anisotropy!==void 0&&(t.anisotropy=e.anisotropy),e.colorSpace!==void 0&&(t.colorSpace=e.colorSpace),e.flipY!==void 0&&(t.flipY=e.flipY),e.generateMipmaps!==void 0&&(t.generateMipmaps=e.generateMipmaps),e.internalFormat!==void 0&&(t.internalFormat=e.internalFormat);for(let i=0;i<this.textures.length;i++)this.textures[i].setValues(t)}get texture(){return this.textures[0]}set texture(e){this.textures[0]=e}set depthTexture(e){this._depthTexture!==null&&this._depthTexture.renderTarget===this&&(this._depthTexture.renderTarget=null),e!==null&&e.renderTarget===null&&(e.renderTarget=this),this._depthTexture=e}get depthTexture(){return this._depthTexture}setSize(e,t,i=1){if(this.width!==e||this.height!==t||this.depth!==i){this.width=e,this.height=t,this.depth=i;for(let n=0,s=this.textures.length;n<s;n++)this.textures[n].image.width=e,this.textures[n].image.height=t,this.textures[n].image.depth=i,this.textures[n].isData3DTexture!==!0&&(this.textures[n].isArrayTexture=this.textures[n].image.depth>1);this.dispose()}this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)}clone(){return new this.constructor().copy(this)}copy(e){this.width=e.width,this.height=e.height,this.depth=e.depth,this.scissor.copy(e.scissor),this.scissorTest=e.scissorTest,this.viewport.copy(e.viewport),this.textures.length=0;for(let t=0,i=e.textures.length;t<i;t++){this.textures[t]=e.textures[t].clone(),this.textures[t].isRenderTargetTexture=!0,this.textures[t].renderTarget=this;const n=Object.assign({},e.textures[t].image);this.textures[t].source=new sl(n)}if(this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,this.resolveColorBuffer=e.resolveColorBuffer,this.resolveDepthBuffer=e.resolveDepthBuffer,this.resolveStencilBuffer=e.resolveStencilBuffer,this.storeMultisampledColorBuffer=e.storeMultisampledColorBuffer,this.storeMultisampledDepthBuffer=e.storeMultisampledDepthBuffer,this.storeMultisampledStencilBuffer=e.storeMultisampledStencilBuffer,e.depthTexture!==null)if(e.depthTexture.renderTarget===e){const t=e.depthTexture.clone();t.renderTarget=null,this.depthTexture=t}else this.depthTexture=e.depthTexture;return this.samples=e.samples,this.multiview=e.multiview,this.useArrayDepthTexture=e.useArrayDepthTexture,this}dispose(){this.dispatchEvent({type:"dispose"})}}class vi extends gf{constructor(e=1,t=1,i={}){super(e,t,i),this.isWebGLRenderTarget=!0}}class Iu extends kt{constructor(e=null,t=1,i=1,n=1){super(null),this.isDataArrayTexture=!0,this.image={data:e,width:t,height:i,depth:n},this.magFilter=bt,this.minFilter=bt,this.wrapR=ii,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}copy(e){return super.copy(e),this.wrapR=e.wrapR,this}addLayerUpdate(e){this.layerUpdates.add(e)}clearLayerUpdates(){this.layerUpdates.clear()}}class xf extends kt{constructor(e=null,t=1,i=1,n=1){super(null),this.isData3DTexture=!0,this.image={data:e,width:t,height:i,depth:n},this.magFilter=bt,this.minFilter=bt,this.wrapR=ii,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}copy(e){return super.copy(e),this.wrapR=e.wrapR,this}}const Kr=class Kr{constructor(e,t,i,n,s,a,o,l,c,h,d,u,f,m,y,p){this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],e!==void 0&&this.set(e,t,i,n,s,a,o,l,c,h,d,u,f,m,y,p)}set(e,t,i,n,s,a,o,l,c,h,d,u,f,m,y,p){const _=this.elements;return _[0]=e,_[4]=t,_[8]=i,_[12]=n,_[1]=s,_[5]=a,_[9]=o,_[13]=l,_[2]=c,_[6]=h,_[10]=d,_[14]=u,_[3]=f,_[7]=m,_[11]=y,_[15]=p,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new Kr().fromArray(this.elements)}copy(e){const t=this.elements,i=e.elements;return t[0]=i[0],t[1]=i[1],t[2]=i[2],t[3]=i[3],t[4]=i[4],t[5]=i[5],t[6]=i[6],t[7]=i[7],t[8]=i[8],t[9]=i[9],t[10]=i[10],t[11]=i[11],t[12]=i[12],t[13]=i[13],t[14]=i[14],t[15]=i[15],this}copyPosition(e){const t=this.elements,i=e.elements;return t[12]=i[12],t[13]=i[13],t[14]=i[14],this}setFromMatrix3(e){const t=e.elements;return this.set(t[0],t[3],t[6],0,t[1],t[4],t[7],0,t[2],t[5],t[8],0,0,0,0,1),this}extractBasis(e,t,i){return this.determinantAffine()===0?(e.set(1,0,0),t.set(0,1,0),i.set(0,0,1),this):(e.setFromMatrixColumn(this,0),t.setFromMatrixColumn(this,1),i.setFromMatrixColumn(this,2),this)}makeBasis(e,t,i){return this.set(e.x,t.x,i.x,0,e.y,t.y,i.y,0,e.z,t.z,i.z,0,0,0,0,1),this}extractRotation(e){if(e.determinantAffine()===0)return this.identity();const t=this.elements,i=e.elements,n=1/On.setFromMatrixColumn(e,0).length(),s=1/On.setFromMatrixColumn(e,1).length(),a=1/On.setFromMatrixColumn(e,2).length();return t[0]=i[0]*n,t[1]=i[1]*n,t[2]=i[2]*n,t[3]=0,t[4]=i[4]*s,t[5]=i[5]*s,t[6]=i[6]*s,t[7]=0,t[8]=i[8]*a,t[9]=i[9]*a,t[10]=i[10]*a,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromEuler(e){const t=this.elements,i=e.x,n=e.y,s=e.z,a=Math.cos(i),o=Math.sin(i),l=Math.cos(n),c=Math.sin(n),h=Math.cos(s),d=Math.sin(s);if(e.order==="XYZ"){const u=a*h,f=a*d,m=o*h,y=o*d;t[0]=l*h,t[4]=-l*d,t[8]=c,t[1]=f+m*c,t[5]=u-y*c,t[9]=-o*l,t[2]=y-u*c,t[6]=m+f*c,t[10]=a*l}else if(e.order==="YXZ"){const u=l*h,f=l*d,m=c*h,y=c*d;t[0]=u+y*o,t[4]=m*o-f,t[8]=a*c,t[1]=a*d,t[5]=a*h,t[9]=-o,t[2]=f*o-m,t[6]=y+u*o,t[10]=a*l}else if(e.order==="ZXY"){const u=l*h,f=l*d,m=c*h,y=c*d;t[0]=u-y*o,t[4]=-a*d,t[8]=m+f*o,t[1]=f+m*o,t[5]=a*h,t[9]=y-u*o,t[2]=-a*c,t[6]=o,t[10]=a*l}else if(e.order==="ZYX"){const u=a*h,f=a*d,m=o*h,y=o*d;t[0]=l*h,t[4]=m*c-f,t[8]=u*c+y,t[1]=l*d,t[5]=y*c+u,t[9]=f*c-m,t[2]=-c,t[6]=o*l,t[10]=a*l}else if(e.order==="YZX"){const u=a*l,f=a*c,m=o*l,y=o*c;t[0]=l*h,t[4]=y-u*d,t[8]=m*d+f,t[1]=d,t[5]=a*h,t[9]=-o*h,t[2]=-c*h,t[6]=f*d+m,t[10]=u-y*d}else if(e.order==="XZY"){const u=a*l,f=a*c,m=o*l,y=o*c;t[0]=l*h,t[4]=-d,t[8]=c*h,t[1]=u*d+y,t[5]=a*h,t[9]=f*d-m,t[2]=m*d-f,t[6]=o*h,t[10]=y*d+u}return t[3]=0,t[7]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromQuaternion(e){return this.compose(yf,e,vf)}lookAt(e,t,i){const n=this.elements;return Yt.subVectors(e,t),Yt.lengthSq()===0&&(Yt.z=1),Yt.normalize(),rn.crossVectors(i,Yt),rn.lengthSq()===0&&(Math.abs(i.z)===1?Yt.x+=1e-4:Yt.z+=1e-4,Yt.normalize(),rn.crossVectors(i,Yt)),rn.normalize(),Xs.crossVectors(Yt,rn),n[0]=rn.x,n[4]=Xs.x,n[8]=Yt.x,n[1]=rn.y,n[5]=Xs.y,n[9]=Yt.y,n[2]=rn.z,n[6]=Xs.z,n[10]=Yt.z,this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){const i=e.elements,n=t.elements,s=this.elements,a=i[0],o=i[4],l=i[8],c=i[12],h=i[1],d=i[5],u=i[9],f=i[13],m=i[2],y=i[6],p=i[10],_=i[14],T=i[3],A=i[7],S=i[11],M=i[15],E=n[0],C=n[4],g=n[8],w=n[12],R=n[1],P=n[5],O=n[9],B=n[13],N=n[2],H=n[6],J=n[10],V=n[14],ne=n[3],q=n[7],ee=n[11],ie=n[15];return s[0]=a*E+o*R+l*N+c*ne,s[4]=a*C+o*P+l*H+c*q,s[8]=a*g+o*O+l*J+c*ee,s[12]=a*w+o*B+l*V+c*ie,s[1]=h*E+d*R+u*N+f*ne,s[5]=h*C+d*P+u*H+f*q,s[9]=h*g+d*O+u*J+f*ee,s[13]=h*w+d*B+u*V+f*ie,s[2]=m*E+y*R+p*N+_*ne,s[6]=m*C+y*P+p*H+_*q,s[10]=m*g+y*O+p*J+_*ee,s[14]=m*w+y*B+p*V+_*ie,s[3]=T*E+A*R+S*N+M*ne,s[7]=T*C+A*P+S*H+M*q,s[11]=T*g+A*O+S*J+M*ee,s[15]=T*w+A*B+S*V+M*ie,this}multiplyScalar(e){const t=this.elements;return t[0]*=e,t[4]*=e,t[8]*=e,t[12]*=e,t[1]*=e,t[5]*=e,t[9]*=e,t[13]*=e,t[2]*=e,t[6]*=e,t[10]*=e,t[14]*=e,t[3]*=e,t[7]*=e,t[11]*=e,t[15]*=e,this}determinant(){const e=this.elements,t=e[0],i=e[4],n=e[8],s=e[12],a=e[1],o=e[5],l=e[9],c=e[13],h=e[2],d=e[6],u=e[10],f=e[14],m=e[3],y=e[7],p=e[11],_=e[15],T=l*f-c*u,A=o*f-c*d,S=o*u-l*d,M=a*f-c*h,E=a*u-l*h,C=a*d-o*h;return t*(y*T-p*A+_*S)-i*(m*T-p*M+_*E)+n*(m*A-y*M+_*C)-s*(m*S-y*E+p*C)}determinantAffine(){const e=this.elements,t=e[0],i=e[4],n=e[8],s=e[1],a=e[5],o=e[9],l=e[2],c=e[6],h=e[10];return t*(a*h-o*c)-i*(s*h-o*l)+n*(s*c-a*l)}transpose(){const e=this.elements;let t;return t=e[1],e[1]=e[4],e[4]=t,t=e[2],e[2]=e[8],e[8]=t,t=e[6],e[6]=e[9],e[9]=t,t=e[3],e[3]=e[12],e[12]=t,t=e[7],e[7]=e[13],e[13]=t,t=e[11],e[11]=e[14],e[14]=t,this}setPosition(e,t,i){const n=this.elements;return e.isVector3?(n[12]=e.x,n[13]=e.y,n[14]=e.z):(n[12]=e,n[13]=t,n[14]=i),this}invert(){const e=this.elements,t=e[0],i=e[1],n=e[2],s=e[3],a=e[4],o=e[5],l=e[6],c=e[7],h=e[8],d=e[9],u=e[10],f=e[11],m=e[12],y=e[13],p=e[14],_=e[15],T=t*o-i*a,A=t*l-n*a,S=t*c-s*a,M=i*l-n*o,E=i*c-s*o,C=n*c-s*l,g=h*y-d*m,w=h*p-u*m,R=h*_-f*m,P=d*p-u*y,O=d*_-f*y,B=u*_-f*p,N=T*B-A*O+S*P+M*R-E*w+C*g;if(N===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);const H=1/N;return e[0]=(o*B-l*O+c*P)*H,e[1]=(n*O-i*B-s*P)*H,e[2]=(y*C-p*E+_*M)*H,e[3]=(u*E-d*C-f*M)*H,e[4]=(l*R-a*B-c*w)*H,e[5]=(t*B-n*R+s*w)*H,e[6]=(p*S-m*C-_*A)*H,e[7]=(h*C-u*S+f*A)*H,e[8]=(a*O-o*R+c*g)*H,e[9]=(i*R-t*O-s*g)*H,e[10]=(m*E-y*S+_*T)*H,e[11]=(d*S-h*E-f*T)*H,e[12]=(o*w-a*P-l*g)*H,e[13]=(t*P-i*w+n*g)*H,e[14]=(y*A-m*M-p*T)*H,e[15]=(h*M-d*A+u*T)*H,this}scale(e){const t=this.elements,i=e.x,n=e.y,s=e.z;return t[0]*=i,t[4]*=n,t[8]*=s,t[1]*=i,t[5]*=n,t[9]*=s,t[2]*=i,t[6]*=n,t[10]*=s,t[3]*=i,t[7]*=n,t[11]*=s,this}getMaxScaleOnAxis(){const e=this.elements,t=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],i=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],n=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];return Math.sqrt(Math.max(t,i,n))}makeTranslation(e,t,i){return e.isVector3?this.set(1,0,0,e.x,0,1,0,e.y,0,0,1,e.z,0,0,0,1):this.set(1,0,0,e,0,1,0,t,0,0,1,i,0,0,0,1),this}makeRotationX(e){const t=Math.cos(e),i=Math.sin(e);return this.set(1,0,0,0,0,t,-i,0,0,i,t,0,0,0,0,1),this}makeRotationY(e){const t=Math.cos(e),i=Math.sin(e);return this.set(t,0,i,0,0,1,0,0,-i,0,t,0,0,0,0,1),this}makeRotationZ(e){const t=Math.cos(e),i=Math.sin(e);return this.set(t,-i,0,0,i,t,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(e,t){const i=Math.cos(t),n=Math.sin(t),s=1-i,a=e.x,o=e.y,l=e.z,c=s*a,h=s*o;return this.set(c*a+i,c*o-n*l,c*l+n*o,0,c*o+n*l,h*o+i,h*l-n*a,0,c*l-n*o,h*l+n*a,s*l*l+i,0,0,0,0,1),this}makeScale(e,t,i){return this.set(e,0,0,0,0,t,0,0,0,0,i,0,0,0,0,1),this}makeShear(e,t,i,n,s,a){return this.set(1,i,s,0,e,1,a,0,t,n,1,0,0,0,0,1),this}compose(e,t,i){const n=this.elements,s=t._x,a=t._y,o=t._z,l=t._w,c=s+s,h=a+a,d=o+o,u=s*c,f=s*h,m=s*d,y=a*h,p=a*d,_=o*d,T=l*c,A=l*h,S=l*d,M=i.x,E=i.y,C=i.z;return n[0]=(1-(y+_))*M,n[1]=(f+S)*M,n[2]=(m-A)*M,n[3]=0,n[4]=(f-S)*E,n[5]=(1-(u+_))*E,n[6]=(p+T)*E,n[7]=0,n[8]=(m+A)*C,n[9]=(p-T)*C,n[10]=(1-(u+y))*C,n[11]=0,n[12]=e.x,n[13]=e.y,n[14]=e.z,n[15]=1,this}decompose(e,t,i){const n=this.elements;e.x=n[12],e.y=n[13],e.z=n[14];const s=this.determinantAffine();if(s===0)return i.set(1,1,1),t.identity(),this;let a=On.set(n[0],n[1],n[2]).length();const o=On.set(n[4],n[5],n[6]).length(),l=On.set(n[8],n[9],n[10]).length();s<0&&(a=-a),ui.copy(this);const c=1/a,h=1/o,d=1/l;return ui.elements[0]*=c,ui.elements[1]*=c,ui.elements[2]*=c,ui.elements[4]*=h,ui.elements[5]*=h,ui.elements[6]*=h,ui.elements[8]*=d,ui.elements[9]*=d,ui.elements[10]*=d,t.setFromRotationMatrix(ui),i.x=a,i.y=o,i.z=l,this}makePerspective(e,t,i,n,s,a,o=Li,l=!1){const c=this.elements,h=2*s/(t-e),d=2*s/(i-n),u=(t+e)/(t-e),f=(i+n)/(i-n);let m,y;if(l)m=s/(a-s),y=a*s/(a-s);else if(o===Li)m=-(a+s)/(a-s),y=-2*a*s/(a-s);else if(o===zr)m=-a/(a-s),y=-a*s/(a-s);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+o);return c[0]=h,c[4]=0,c[8]=u,c[12]=0,c[1]=0,c[5]=d,c[9]=f,c[13]=0,c[2]=0,c[6]=0,c[10]=m,c[14]=y,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(e,t,i,n,s,a,o=Li,l=!1){const c=this.elements,h=2/(t-e),d=2/(i-n),u=-(t+e)/(t-e),f=-(i+n)/(i-n);let m,y;if(l)m=1/(a-s),y=a/(a-s);else if(o===Li)m=-2/(a-s),y=-(a+s)/(a-s);else if(o===zr)m=-1/(a-s),y=-s/(a-s);else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+o);return c[0]=h,c[4]=0,c[8]=0,c[12]=u,c[1]=0,c[5]=d,c[9]=0,c[13]=f,c[2]=0,c[6]=0,c[10]=m,c[14]=y,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(e){const t=this.elements,i=e.elements;for(let n=0;n<16;n++)if(t[n]!==i[n])return!1;return!0}fromArray(e,t=0){for(let i=0;i<16;i++)this.elements[i]=e[i+t];return this}toArray(e=[],t=0){const i=this.elements;return e[t]=i[0],e[t+1]=i[1],e[t+2]=i[2],e[t+3]=i[3],e[t+4]=i[4],e[t+5]=i[5],e[t+6]=i[6],e[t+7]=i[7],e[t+8]=i[8],e[t+9]=i[9],e[t+10]=i[10],e[t+11]=i[11],e[t+12]=i[12],e[t+13]=i[13],e[t+14]=i[14],e[t+15]=i[15],e}};Kr.prototype.isMatrix4=!0;let wt=Kr;const On=new z,ui=new wt,yf=new z(0,0,0),vf=new z(1,1,1),rn=new z,Xs=new z,Yt=new z,Yl=new wt,$l=new as;class In{constructor(e=0,t=0,i=0,n=In.DEFAULT_ORDER){this.isEuler=!0,this._x=e,this._y=t,this._z=i,this._order=n}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get order(){return this._order}set order(e){this._order=e,this._onChangeCallback()}set(e,t,i,n=this._order){return this._x=e,this._y=t,this._z=i,this._order=n,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(e){return this._x=e._x,this._y=e._y,this._z=e._z,this._order=e._order,this._onChangeCallback(),this}setFromRotationMatrix(e,t=this._order,i=!0){const n=e.elements,s=n[0],a=n[4],o=n[8],l=n[1],c=n[5],h=n[9],d=n[2],u=n[6],f=n[10];switch(t){case"XYZ":this._y=Math.asin(Ve(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(-h,f),this._z=Math.atan2(-a,s)):(this._x=Math.atan2(u,c),this._z=0);break;case"YXZ":this._x=Math.asin(-Ve(h,-1,1)),Math.abs(h)<.9999999?(this._y=Math.atan2(o,f),this._z=Math.atan2(l,c)):(this._y=Math.atan2(-d,s),this._z=0);break;case"ZXY":this._x=Math.asin(Ve(u,-1,1)),Math.abs(u)<.9999999?(this._y=Math.atan2(-d,f),this._z=Math.atan2(-a,c)):(this._y=0,this._z=Math.atan2(l,s));break;case"ZYX":this._y=Math.asin(-Ve(d,-1,1)),Math.abs(d)<.9999999?(this._x=Math.atan2(u,f),this._z=Math.atan2(l,s)):(this._x=0,this._z=Math.atan2(-a,c));break;case"YZX":this._z=Math.asin(Ve(l,-1,1)),Math.abs(l)<.9999999?(this._x=Math.atan2(-h,c),this._y=Math.atan2(-d,s)):(this._x=0,this._y=Math.atan2(o,f));break;case"XZY":this._z=Math.asin(-Ve(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(u,c),this._y=Math.atan2(o,s)):(this._x=Math.atan2(-h,f),this._y=0);break;default:Re("Euler: .setFromRotationMatrix() encountered an unknown order: "+t)}return this._order=t,i===!0&&this._onChangeCallback(),this}setFromQuaternion(e,t,i){return Yl.makeRotationFromQuaternion(e),this.setFromRotationMatrix(Yl,t,i)}setFromVector3(e,t=this._order){return this.set(e.x,e.y,e.z,t)}reorder(e){return $l.setFromEuler(this),this.setFromQuaternion($l,e)}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._order===this._order}fromArray(e){return this._x=e[0],this._y=e[1],this._z=e[2],e[3]!==void 0&&(this._order=e[3]),this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._order,e}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}}In.DEFAULT_ORDER="XYZ";class Du{constructor(){this.mask=1}set(e){this.mask=(1<<e|0)>>>0}enable(e){this.mask|=1<<e|0}enableAll(){this.mask=-1}toggle(e){this.mask^=1<<e|0}disable(e){this.mask&=~(1<<e|0)}disableAll(){this.mask=0}test(e){return(this.mask&e.mask)!==0}isEnabled(e){return(this.mask&(1<<e|0))!==0}}let Sf=0;const Kl=new z,Un=new as,ki=new wt,qs=new z,cs=new z,Mf=new z,Ef=new as,jl=new z(1,0,0),Jl=new z(0,1,0),Zl=new z(0,0,1),Ql={type:"added"},wf={type:"removed"},kn={type:"childadded",child:null},xa={type:"childremoved",child:null};class ni extends Dn{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:Sf++}),this.uuid=Os(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=ni.DEFAULT_UP.clone();const e=new z,t=new In,i=new as,n=new z(1,1,1);function s(){i.setFromEuler(t,!1)}function a(){t.setFromQuaternion(i,void 0,!1)}t._onChange(s),i._onChange(a),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:e},rotation:{configurable:!0,enumerable:!0,value:t},quaternion:{configurable:!0,enumerable:!0,value:i},scale:{configurable:!0,enumerable:!0,value:n},modelViewMatrix:{value:new wt},normalMatrix:{value:new Ie}}),this.matrix=new wt,this.matrixWorld=new wt,this.matrixAutoUpdate=ni.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=ni.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new Du,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.customDepthMaterial=void 0,this.customDistanceMaterial=void 0,this.static=!1,this.userData={},this.pivot=null}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(e){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(e),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(e){return this.quaternion.premultiply(e),this}setRotationFromAxisAngle(e,t){this.quaternion.setFromAxisAngle(e,t)}setRotationFromEuler(e){this.quaternion.setFromEuler(e,!0)}setRotationFromMatrix(e){this.quaternion.setFromRotationMatrix(e)}setRotationFromQuaternion(e){this.quaternion.copy(e)}rotateOnAxis(e,t){return Un.setFromAxisAngle(e,t),this.quaternion.multiply(Un),this}rotateOnWorldAxis(e,t){return Un.setFromAxisAngle(e,t),this.quaternion.premultiply(Un),this}rotateX(e){return this.rotateOnAxis(jl,e)}rotateY(e){return this.rotateOnAxis(Jl,e)}rotateZ(e){return this.rotateOnAxis(Zl,e)}translateOnAxis(e,t){return Kl.copy(e).applyQuaternion(this.quaternion),this.position.add(Kl.multiplyScalar(t)),this}translateX(e){return this.translateOnAxis(jl,e)}translateY(e){return this.translateOnAxis(Jl,e)}translateZ(e){return this.translateOnAxis(Zl,e)}localToWorld(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(this.matrixWorld)}worldToLocal(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(ki.copy(this.matrixWorld).invert())}lookAt(e,t,i){e.isVector3?qs.copy(e):qs.set(e,t,i);const n=this.parent;this.updateWorldMatrix(!0,!1),cs.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?ki.lookAt(cs,qs,this.up):ki.lookAt(qs,cs,this.up),this.quaternion.setFromRotationMatrix(ki),n&&(ki.extractRotation(n.matrixWorld),Un.setFromRotationMatrix(ki),this.quaternion.premultiply(Un.invert()))}add(e){if(arguments.length>1){for(let t=0;t<arguments.length;t++)this.add(arguments[t]);return this}return e===this?(Ke("Object3D.add: object can't be added as a child of itself.",e),this):(e&&e.isObject3D?(e.removeFromParent(),e.parent=this,this.children.push(e),e.dispatchEvent(Ql),kn.child=e,this.dispatchEvent(kn),kn.child=null):Ke("Object3D.add: object not an instance of THREE.Object3D.",e),this)}remove(e){if(arguments.length>1){for(let i=0;i<arguments.length;i++)this.remove(arguments[i]);return this}const t=this.children.indexOf(e);return t!==-1&&(e.parent=null,this.children.splice(t,1),e.dispatchEvent(wf),xa.child=e,this.dispatchEvent(xa),xa.child=null),this}removeFromParent(){const e=this.parent;return e!==null&&e.remove(this),this}clear(){return this.remove(...this.children)}attach(e){return this.updateWorldMatrix(!0,!1),ki.copy(this.matrixWorld).invert(),e.parent!==null&&(e.parent.updateWorldMatrix(!0,!1),ki.multiply(e.parent.matrixWorld)),e.applyMatrix4(ki),e.removeFromParent(),e.parent=this,this.children.push(e),e.updateWorldMatrix(!1,!0),e.dispatchEvent(Ql),kn.child=e,this.dispatchEvent(kn),kn.child=null,this}getObjectById(e){return this.getObjectByProperty("id",e)}getObjectByName(e){return this.getObjectByProperty("name",e)}getObjectByProperty(e,t){if(this[e]===t)return this;for(let i=0,n=this.children.length;i<n;i++){const a=this.children[i].getObjectByProperty(e,t);if(a!==void 0)return a}}getObjectsByProperty(e,t,i=[]){this[e]===t&&i.push(this);const n=this.children;for(let s=0,a=n.length;s<a;s++)n[s].getObjectsByProperty(e,t,i);return i}getWorldPosition(e){return this.updateWorldMatrix(!0,!1),e.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(cs,e,Mf),e}getWorldScale(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(cs,Ef,e),e}getWorldDirection(e){this.updateWorldMatrix(!0,!1);const t=this.matrixWorld.elements;return e.set(t[8],t[9],t[10]).normalize()}raycast(){}intersectsFrustum(){}traverse(e){e(this);const t=this.children;for(let i=0,n=t.length;i<n;i++)t[i].traverse(e)}traverseVisible(e){if(this.visible===!1)return;e(this);const t=this.children;for(let i=0,n=t.length;i<n;i++)t[i].traverseVisible(e)}traverseAncestors(e){const t=this.parent;t!==null&&(e(t),t.traverseAncestors(e))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale);const e=this.pivot;if(e!==null){const t=e.x,i=e.y,n=e.z,s=this.matrix.elements;s[12]+=t-s[0]*t-s[4]*i-s[8]*n,s[13]+=i-s[1]*t-s[5]*i-s[9]*n,s[14]+=n-s[2]*t-s[6]*i-s[10]*n}this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(e){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||e)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,e=!0);const t=this.children;for(let i=0,n=t.length;i<n;i++)t[i].updateMatrixWorld(e)}updateWorldMatrix(e,t,i=!1){const n=this.parent;if(e===!0&&n!==null&&n.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||i)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,i=!0),t===!0){const s=this.children;for(let a=0,o=s.length;a<o;a++)s[a].updateWorldMatrix(!1,!0,i)}}toJSON(e){const t=e===void 0||typeof e=="string",i={};t&&(e={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},i.metadata={version:4.7,type:"Object",generator:"Object3D.toJSON"});const n={};n.uuid=this.uuid,n.type=this.type,n.name=this.name,n.castShadow=this.castShadow,n.receiveShadow=this.receiveShadow,n.visible=this.visible,n.frustumCulled=this.frustumCulled,n.renderOrder=this.renderOrder,n.static=this.static,n.matrixAutoUpdate=this.matrixAutoUpdate,Object.keys(this.userData).length>0&&(n.userData=this.userData),n.layers=this.layers.mask,n.matrix=this.matrix.toArray(),n.up=this.up.toArray(),this.pivot!==null&&(n.pivot=this.pivot.toArray()),this.morphTargetDictionary!==void 0&&(n.morphTargetDictionary=Object.assign({},this.morphTargetDictionary)),this.morphTargetInfluences!==void 0&&(n.morphTargetInfluences=this.morphTargetInfluences.slice()),this.isInstancedMesh&&(n.type="InstancedMesh",n.count=this.count,n.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(n.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(n.type="BatchedMesh",n.perObjectFrustumCulled=this.perObjectFrustumCulled,n.sortObjects=this.sortObjects,n.drawRanges=this._drawRanges,n.reservedRanges=this._reservedRanges,n.geometryInfo=this._geometryInfo.map(o=>({...o,boundingBox:o.boundingBox?o.boundingBox.toJSON():void 0,boundingSphere:o.boundingSphere?o.boundingSphere.toJSON():void 0})),n.instanceInfo=this._instanceInfo.map(o=>({...o})),n.availableInstanceIds=this._availableInstanceIds.slice(),n.availableGeometryIds=this._availableGeometryIds.slice(),n.nextIndexStart=this._nextIndexStart,n.nextVertexStart=this._nextVertexStart,n.geometryCount=this._geometryCount,n.maxInstanceCount=this._maxInstanceCount,n.maxVertexCount=this._maxVertexCount,n.maxIndexCount=this._maxIndexCount,n.geometryInitialized=this._geometryInitialized,n.matricesTexture=this._matricesTexture.toJSON(e),n.indirectTexture=this._indirectTexture.toJSON(e),this._colorsTexture!==null&&(n.colorsTexture=this._colorsTexture.toJSON(e)),this.boundingSphere!==null&&(n.boundingSphere=this.boundingSphere.toJSON()),this.boundingBox!==null&&(n.boundingBox=this.boundingBox.toJSON()));function s(o,l){return o[l.uuid]===void 0&&(o[l.uuid]=l.toJSON(e)),l.uuid}if(this.isScene)this.background&&(this.background.isColor?n.background=this.background.toJSON():this.background.isTexture&&(n.background=this.background.toJSON(e).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(n.environment=this.environment.toJSON(e).uuid);else if(this.isMesh||this.isLine||this.isPoints){n.geometry=s(e.geometries,this.geometry);const o=this.geometry.parameters;if(o!==void 0&&o.shapes!==void 0){const l=o.shapes;if(Array.isArray(l))for(let c=0,h=l.length;c<h;c++){const d=l[c];s(e.shapes,d)}else s(e.shapes,l)}}if(this.isSkinnedMesh&&(n.bindMode=this.bindMode,n.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(s(e.skeletons,this.skeleton),n.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){const o=[];for(let l=0,c=this.material.length;l<c;l++)o.push(s(e.materials,this.material[l]));n.material=o}else n.material=s(e.materials,this.material);if(this.children.length>0){n.children=[];for(let o=0;o<this.children.length;o++)n.children.push(this.children[o].toJSON(e).object)}if(this.animations.length>0){n.animations=[];for(let o=0;o<this.animations.length;o++){const l=this.animations[o];n.animations.push(s(e.animations,l))}}if(t){const o=a(e.geometries),l=a(e.materials),c=a(e.textures),h=a(e.images),d=a(e.shapes),u=a(e.skeletons),f=a(e.animations),m=a(e.nodes);o.length>0&&(i.geometries=o),l.length>0&&(i.materials=l),c.length>0&&(i.textures=c),h.length>0&&(i.images=h),d.length>0&&(i.shapes=d),u.length>0&&(i.skeletons=u),f.length>0&&(i.animations=f),m.length>0&&(i.nodes=m)}return i.object=n,i;function a(o){const l=[];for(const c in o){const h=o[c];delete h.metadata,l.push(h)}return l}}clone(e){return new this.constructor().copy(this,e)}copy(e,t=!0){if(this.name=e.name,this.up.copy(e.up),this.position.copy(e.position),this.rotation.order=e.rotation.order,this.quaternion.copy(e.quaternion),this.scale.copy(e.scale),this.pivot=e.pivot!==null?e.pivot.clone():null,this.matrix.copy(e.matrix),this.matrixWorld.copy(e.matrixWorld),this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrixWorldAutoUpdate=e.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=e.matrixWorldNeedsUpdate,this.layers.mask=e.layers.mask,this.visible=e.visible,this.castShadow=e.castShadow,this.receiveShadow=e.receiveShadow,this.frustumCulled=e.frustumCulled,this.renderOrder=e.renderOrder,this.static=e.static,this.animations=e.animations.slice(),this.userData=JSON.parse(JSON.stringify(e.userData)),t===!0)for(let i=0;i<e.children.length;i++){const n=e.children[i];this.add(n.clone())}return this}dispose(){this.dispatchEvent({type:"dispose"})}}ni.DEFAULT_UP=new z(0,1,0);ni.DEFAULT_MATRIX_AUTO_UPDATE=!0;ni.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;class Ys extends ni{constructor(){super(),this.isGroup=!0,this.type="Group"}}const Tf={type:"move"};class ya{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new Ys,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new Ys,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new z,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new z),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new Ys,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new z,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new z,this._grip.eventsEnabled=!1),this._grip}dispatchEvent(e){return this._targetRay!==null&&this._targetRay.dispatchEvent(e),this._grip!==null&&this._grip.dispatchEvent(e),this._hand!==null&&this._hand.dispatchEvent(e),this}connect(e){if(e&&e.hand){const t=this._hand;if(t)for(const i of e.hand.values())this._getHandJoint(t,i)}return this.dispatchEvent({type:"connected",data:e}),this}disconnect(e){return this.dispatchEvent({type:"disconnected",data:e}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(e,t,i){let n=null,s=null,a=null;const o=this._targetRay,l=this._grip,c=this._hand;if(e&&t.session.visibilityState!=="visible-blurred"){if(c&&e.hand){a=!0;for(const y of e.hand.values()){const p=t.getJointPose(y,i),_=this._getHandJoint(c,y);p!==null&&(_.matrix.fromArray(p.transform.matrix),_.matrix.decompose(_.position,_.rotation,_.scale),_.matrixWorldNeedsUpdate=!0,_.jointRadius=p.radius),_.visible=p!==null}const h=c.joints["index-finger-tip"],d=c.joints["thumb-tip"],u=h.position.distanceTo(d.position),f=.02,m=.005;c.inputState.pinching&&u>f+m?(c.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:e.handedness,target:this})):!c.inputState.pinching&&u<=f-m&&(c.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:e.handedness,target:this}))}else l!==null&&e.gripSpace&&(s=t.getPose(e.gripSpace,i),s!==null&&(l.matrix.fromArray(s.transform.matrix),l.matrix.decompose(l.position,l.rotation,l.scale),l.matrixWorldNeedsUpdate=!0,s.linearVelocity?(l.hasLinearVelocity=!0,l.linearVelocity.copy(s.linearVelocity)):l.hasLinearVelocity=!1,s.angularVelocity?(l.hasAngularVelocity=!0,l.angularVelocity.copy(s.angularVelocity)):l.hasAngularVelocity=!1,l.eventsEnabled&&l.dispatchEvent({type:"gripUpdated",data:e,target:this})));o!==null&&(n=t.getPose(e.targetRaySpace,i),n===null&&s!==null&&(n=s),n!==null&&(o.matrix.fromArray(n.transform.matrix),o.matrix.decompose(o.position,o.rotation,o.scale),o.matrixWorldNeedsUpdate=!0,n.linearVelocity?(o.hasLinearVelocity=!0,o.linearVelocity.copy(n.linearVelocity)):o.hasLinearVelocity=!1,n.angularVelocity?(o.hasAngularVelocity=!0,o.angularVelocity.copy(n.angularVelocity)):o.hasAngularVelocity=!1,this.dispatchEvent(Tf)))}return o!==null&&(o.visible=n!==null),l!==null&&(l.visible=s!==null),c!==null&&(c.visible=a!==null),this}_getHandJoint(e,t){if(e.joints[t.jointName]===void 0){const i=new Ys;i.matrixAutoUpdate=!1,i.visible=!1,e.joints[t.jointName]=i,e.add(i)}return e.joints[t.jointName]}}const Lu={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},an={h:0,s:0,l:0},$s={h:0,s:0,l:0};function va(r,e,t){return t<0&&(t+=1),t>1&&(t-=1),t<1/6?r+(e-r)*6*t:t<1/2?e:t<2/3?r+(e-r)*6*(2/3-t):r}class Xe{constructor(e,t,i){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(e,t,i)}set(e,t,i){if(t===void 0&&i===void 0){const n=e;n&&n.isColor?this.copy(n):typeof n=="number"?this.setHex(n):typeof n=="string"&&this.setStyle(n)}else this.setRGB(e,t,i);return this}setScalar(e){return this.r=e,this.g=e,this.b=e,this}setHex(e,t=oi){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(e&255)/255,We.colorSpaceToWorking(this,t),this}setRGB(e,t,i,n=We.workingColorSpace){return this.r=e,this.g=t,this.b=i,We.colorSpaceToWorking(this,n),this}setHSL(e,t,i,n=We.workingColorSpace){if(e=df(e,1),t=Ve(t,0,1),i=Ve(i,0,1),t===0)this.r=this.g=this.b=i;else{const s=i<=.5?i*(1+t):i+t-i*t,a=2*i-s;this.r=va(a,s,e+1/3),this.g=va(a,s,e),this.b=va(a,s,e-1/3)}return We.colorSpaceToWorking(this,n),this}setStyle(e,t=oi){function i(s){s!==void 0&&parseFloat(s)<1&&Re("Color: Alpha component of "+e+" will be ignored.")}let n;if(n=/^(\w+)\(([^\)]*)\)/.exec(e)){let s;const a=n[1],o=n[2];switch(a){case"rgb":case"rgba":if(s=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return i(s[4]),this.setRGB(Math.min(255,parseInt(s[1],10))/255,Math.min(255,parseInt(s[2],10))/255,Math.min(255,parseInt(s[3],10))/255,t);if(s=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return i(s[4]),this.setRGB(Math.min(100,parseInt(s[1],10))/100,Math.min(100,parseInt(s[2],10))/100,Math.min(100,parseInt(s[3],10))/100,t);break;case"hsl":case"hsla":if(s=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(o))return i(s[4]),this.setHSL(parseFloat(s[1])/360,parseFloat(s[2])/100,parseFloat(s[3])/100,t);break;default:Re("Color: Unknown color model "+e)}}else if(n=/^\#([A-Fa-f\d]+)$/.exec(e)){const s=n[1],a=s.length;if(a===3)return this.setRGB(parseInt(s.charAt(0),16)/15,parseInt(s.charAt(1),16)/15,parseInt(s.charAt(2),16)/15,t);if(a===6)return this.setHex(parseInt(s,16),t);Re("Color: Invalid hex color "+e)}else if(e&&e.length>0)return this.setColorName(e,t);return this}setColorName(e,t=oi){const i=Lu[e.toLowerCase()];return i!==void 0?this.setHex(i,t):Re("Color: Unknown color "+e),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(e){return this.r=e.r,this.g=e.g,this.b=e.b,this}copySRGBToLinear(e){return this.r=ji(e.r),this.g=ji(e.g),this.b=ji(e.b),this}copyLinearToSRGB(e){return this.r=is(e.r),this.g=is(e.g),this.b=is(e.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(e=oi){return We.workingToColorSpace(Ut.copy(this),e),Math.round(Ve(Ut.r*255,0,255))*65536+Math.round(Ve(Ut.g*255,0,255))*256+Math.round(Ve(Ut.b*255,0,255))}getHexString(e=oi){return("000000"+this.getHex(e).toString(16)).slice(-6)}getHSL(e,t=We.workingColorSpace){We.workingToColorSpace(Ut.copy(this),t);const i=Ut.r,n=Ut.g,s=Ut.b,a=Math.max(i,n,s),o=Math.min(i,n,s);let l,c;const h=(o+a)/2;if(o===a)l=0,c=0;else{const d=a-o;switch(c=h<=.5?d/(a+o):d/(2-a-o),a){case i:l=(n-s)/d+(n<s?6:0);break;case n:l=(s-i)/d+2;break;case s:l=(i-n)/d+4;break}l/=6}return e.h=l,e.s=c,e.l=h,e}getRGB(e,t=We.workingColorSpace){return We.workingToColorSpace(Ut.copy(this),t),e.r=Ut.r,e.g=Ut.g,e.b=Ut.b,e}getStyle(e=oi){We.workingToColorSpace(Ut.copy(this),e);const t=Ut.r,i=Ut.g,n=Ut.b;return e!==oi?`color(${e} ${t.toFixed(3)} ${i.toFixed(3)} ${n.toFixed(3)})`:`rgb(${Math.round(t*255)},${Math.round(i*255)},${Math.round(n*255)})`}offsetHSL(e,t,i){return this.getHSL(an),this.setHSL(an.h+e,an.s+t,an.l+i)}add(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this}addColors(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this}addScalar(e){return this.r+=e,this.g+=e,this.b+=e,this}sub(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this}multiply(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this}multiplyScalar(e){return this.r*=e,this.g*=e,this.b*=e,this}lerp(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this}lerpColors(e,t,i){return this.r=e.r+(t.r-e.r)*i,this.g=e.g+(t.g-e.g)*i,this.b=e.b+(t.b-e.b)*i,this}lerpHSL(e,t){this.getHSL(an),e.getHSL($s);const i=fa(an.h,$s.h,t),n=fa(an.s,$s.s,t),s=fa(an.l,$s.l,t);return this.setHSL(i,n,s),this}setFromVector3(e){return this.r=e.x,this.g=e.y,this.b=e.z,this}applyMatrix3(e){const t=this.r,i=this.g,n=this.b,s=e.elements;return this.r=s[0]*t+s[3]*i+s[6]*n,this.g=s[1]*t+s[4]*i+s[7]*n,this.b=s[2]*t+s[5]*i+s[8]*n,this}equals(e){return e.r===this.r&&e.g===this.g&&e.b===this.b}fromArray(e,t=0){return this.r=e[t],this.g=e[t+1],this.b=e[t+2],this}toArray(e=[],t=0){return e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e}fromBufferAttribute(e,t){return this.r=e.getX(t),this.g=e.getY(t),this.b=e.getZ(t),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}}const Ut=new Xe;Xe.NAMES=Lu;class bf extends ni{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new In,this.environmentIntensity=1,this.environmentRotation=new In,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(e,t){return super.copy(e,t),e.background!==null&&(this.background=e.background.clone()),e.environment!==null&&(this.environment=e.environment.clone()),e.fog!==null&&(this.fog=e.fog.clone()),this.backgroundBlurriness=e.backgroundBlurriness,this.backgroundIntensity=e.backgroundIntensity,this.backgroundRotation.copy(e.backgroundRotation),this.environmentIntensity=e.environmentIntensity,this.environmentRotation.copy(e.environmentRotation),e.overrideMaterial!==null&&(this.overrideMaterial=e.overrideMaterial.clone()),this.matrixAutoUpdate=e.matrixAutoUpdate,this}toJSON(e){const t=super.toJSON(e);return this.fog!==null&&(t.object.fog=this.fog.toJSON()),t.object.backgroundBlurriness=this.backgroundBlurriness,t.object.backgroundIntensity=this.backgroundIntensity,t.object.backgroundRotation=this.backgroundRotation.toArray(),t.object.environmentIntensity=this.environmentIntensity,t.object.environmentRotation=this.environmentRotation.toArray(),t}}const di=new z,Bi=new z,Sa=new z,Hi=new z,Bn=new z,Hn=new z,ec=new z,Ma=new z,Ea=new z,wa=new z,Ta=new xt,ba=new xt,Aa=new xt;class xi{constructor(e=new z,t=new z,i=new z){this.a=e,this.b=t,this.c=i}static getNormal(e,t,i,n){n.subVectors(i,t),di.subVectors(e,t),n.cross(di);const s=n.lengthSq();return s>0?n.multiplyScalar(1/Math.sqrt(s)):n.set(0,0,0)}static getBarycoord(e,t,i,n,s){di.subVectors(n,t),Bi.subVectors(i,t),Sa.subVectors(e,t);const a=di.dot(di),o=di.dot(Bi),l=di.dot(Sa),c=Bi.dot(Bi),h=Bi.dot(Sa),d=a*c-o*o;if(d===0)return s.set(0,0,0),null;const u=1/d,f=(c*l-o*h)*u,m=(a*h-o*l)*u;return s.set(1-f-m,m,f)}static containsPoint(e,t,i,n){return this.getBarycoord(e,t,i,n,Hi)===null?!1:Hi.x>=0&&Hi.y>=0&&Hi.x+Hi.y<=1}static getInterpolation(e,t,i,n,s,a,o,l){return this.getBarycoord(e,t,i,n,Hi)===null?(l.x=0,l.y=0,"z"in l&&(l.z=0),"w"in l&&(l.w=0),null):(l.setScalar(0),l.addScaledVector(s,Hi.x),l.addScaledVector(a,Hi.y),l.addScaledVector(o,Hi.z),l)}static getInterpolatedAttribute(e,t,i,n,s,a){return Ta.setScalar(0),ba.setScalar(0),Aa.setScalar(0),Ta.fromBufferAttribute(e,t),ba.fromBufferAttribute(e,i),Aa.fromBufferAttribute(e,n),a.setScalar(0),a.addScaledVector(Ta,s.x),a.addScaledVector(ba,s.y),a.addScaledVector(Aa,s.z),a}static isFrontFacing(e,t,i,n){return di.subVectors(i,t),Bi.subVectors(e,t),di.cross(Bi).dot(n)<0}set(e,t,i){return this.a.copy(e),this.b.copy(t),this.c.copy(i),this}setFromPointsAndIndices(e,t,i,n){return this.a.copy(e[t]),this.b.copy(e[i]),this.c.copy(e[n]),this}setFromAttributeAndIndices(e,t,i,n){return this.a.fromBufferAttribute(e,t),this.b.fromBufferAttribute(e,i),this.c.fromBufferAttribute(e,n),this}clone(){return new this.constructor().copy(this)}copy(e){return this.a.copy(e.a),this.b.copy(e.b),this.c.copy(e.c),this}getArea(){return di.subVectors(this.c,this.b),Bi.subVectors(this.a,this.b),di.cross(Bi).length()*.5}getMidpoint(e){return e.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(e){return xi.getNormal(this.a,this.b,this.c,e)}getPlane(e){return e.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(e,t){return xi.getBarycoord(e,this.a,this.b,this.c,t)}getInterpolation(e,t,i,n,s){return xi.getInterpolation(e,this.a,this.b,this.c,t,i,n,s)}containsPoint(e){return xi.containsPoint(e,this.a,this.b,this.c)}isFrontFacing(e){return xi.isFrontFacing(this.a,this.b,this.c,e)}intersectsBox(e){return e.intersectsTriangle(this)}closestPointToPoint(e,t){const i=this.a,n=this.b,s=this.c;let a,o;Bn.subVectors(n,i),Hn.subVectors(s,i),Ma.subVectors(e,i);const l=Bn.dot(Ma),c=Hn.dot(Ma);if(l<=0&&c<=0)return t.copy(i);Ea.subVectors(e,n);const h=Bn.dot(Ea),d=Hn.dot(Ea);if(h>=0&&d<=h)return t.copy(n);const u=l*d-h*c;if(u<=0&&l>=0&&h<=0)return a=l/(l-h),t.copy(i).addScaledVector(Bn,a);wa.subVectors(e,s);const f=Bn.dot(wa),m=Hn.dot(wa);if(m>=0&&f<=m)return t.copy(s);const y=f*c-l*m;if(y<=0&&c>=0&&m<=0)return o=c/(c-m),t.copy(i).addScaledVector(Hn,o);const p=h*m-f*d;if(p<=0&&d-h>=0&&f-m>=0)return ec.subVectors(s,n),o=(d-h)/(d-h+(f-m)),t.copy(n).addScaledVector(ec,o);const _=1/(p+y+u);return a=y*_,o=u*_,t.copy(i).addScaledVector(Bn,a).addScaledVector(Hn,o)}equals(e){return e.a.equals(this.a)&&e.b.equals(this.b)&&e.c.equals(this.c)}}class Us{constructor(e=new z(1/0,1/0,1/0),t=new z(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromArray(e){this.makeEmpty();for(let t=0,i=e.length;t<i;t+=3)this.expandByPoint(fi.fromArray(e,t));return this}setFromBufferAttribute(e){this.makeEmpty();for(let t=0,i=e.count;t<i;t++)this.expandByPoint(fi.fromBufferAttribute(e,t));return this}setFromPoints(e){this.makeEmpty();for(let t=0,i=e.length;t<i;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){const i=fi.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(i),this.max.copy(e).add(i),this}setFromObject(e,t=!1){return this.makeEmpty(),this.expandByObject(e,t)}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(e){return this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}expandByObject(e,t=!1){e.updateWorldMatrix(!1,!1);const i=e.geometry;if(i!==void 0){const s=i.getAttribute("position");if(t===!0&&s!==void 0&&e.isInstancedMesh!==!0)for(let a=0,o=s.count;a<o;a++)e.isMesh===!0?e.getVertexPosition(a,fi):fi.fromBufferAttribute(s,a),fi.applyMatrix4(e.matrixWorld),this.expandByPoint(fi);else e.boundingBox!==void 0?(e.boundingBox===null&&e.computeBoundingBox(),Ks.copy(e.boundingBox)):(i.boundingBox===null&&i.computeBoundingBox(),Ks.copy(i.boundingBox)),Ks.applyMatrix4(e.matrixWorld),this.union(Ks)}const n=e.children;for(let s=0,a=n.length;s<a;s++)this.expandByObject(n[s],t);return this}containsPoint(e){return e.x>=this.min.x&&e.x<=this.max.x&&e.y>=this.min.y&&e.y<=this.max.y&&e.z>=this.min.z&&e.z<=this.max.z}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(e){return e.max.x>=this.min.x&&e.min.x<=this.max.x&&e.max.y>=this.min.y&&e.min.y<=this.max.y&&e.max.z>=this.min.z&&e.min.z<=this.max.z}intersectsSphere(e){return this.clampPoint(e.center,fi),fi.distanceToSquared(e.center)<=e.radius*e.radius}intersectsPlane(e){let t,i;return e.normal.x>0?(t=e.normal.x*this.min.x,i=e.normal.x*this.max.x):(t=e.normal.x*this.max.x,i=e.normal.x*this.min.x),e.normal.y>0?(t+=e.normal.y*this.min.y,i+=e.normal.y*this.max.y):(t+=e.normal.y*this.max.y,i+=e.normal.y*this.min.y),e.normal.z>0?(t+=e.normal.z*this.min.z,i+=e.normal.z*this.max.z):(t+=e.normal.z*this.max.z,i+=e.normal.z*this.min.z),t<=-e.constant&&i>=-e.constant}intersectsTriangle(e){if(this.isEmpty())return!1;this.getCenter(hs),js.subVectors(this.max,hs),Gn.subVectors(e.a,hs),zn.subVectors(e.b,hs),Wn.subVectors(e.c,hs),on.subVectors(zn,Gn),ln.subVectors(Wn,zn),gn.subVectors(Gn,Wn);let t=[0,-on.z,on.y,0,-ln.z,ln.y,0,-gn.z,gn.y,on.z,0,-on.x,ln.z,0,-ln.x,gn.z,0,-gn.x,-on.y,on.x,0,-ln.y,ln.x,0,-gn.y,gn.x,0];return!Ca(t,Gn,zn,Wn,js)||(t=[1,0,0,0,1,0,0,0,1],!Ca(t,Gn,zn,Wn,js))?!1:(Js.crossVectors(on,ln),t=[Js.x,Js.y,Js.z],Ca(t,Gn,zn,Wn,js))}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,fi).distanceTo(e)}getBoundingSphere(e){return this.isEmpty()?e.makeEmpty():(this.getCenter(e.center),e.radius=this.getSize(fi).length()*.5),e}intersect(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}applyMatrix4(e){return this.isEmpty()?this:(Gi[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(e),Gi[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(e),Gi[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(e),Gi[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(e),Gi[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(e),Gi[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(e),Gi[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(e),Gi[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(e),this.setFromPoints(Gi),this)}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}toJSON(){return{min:this.min.toArray(),max:this.max.toArray()}}fromJSON(e){return this.min.fromArray(e.min),this.max.fromArray(e.max),this}}const Gi=[new z,new z,new z,new z,new z,new z,new z,new z],fi=new z,Ks=new Us,Gn=new z,zn=new z,Wn=new z,on=new z,ln=new z,gn=new z,hs=new z,js=new z,Js=new z,xn=new z;function Ca(r,e,t,i,n){for(let s=0,a=r.length-3;s<=a;s+=3){xn.fromArray(r,s);const o=n.x*Math.abs(xn.x)+n.y*Math.abs(xn.y)+n.z*Math.abs(xn.z),l=e.dot(xn),c=t.dot(xn),h=i.dot(xn);if(Math.max(-Math.max(l,c,h),Math.min(l,c,h))>o)return!1}return!0}const Et=new z,Zs=new Ge;let Af=0;class Ji extends Dn{constructor(e,t,i=!1){if(super(),Array.isArray(e))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:Af++}),this.name="",this.array=e,this.itemSize=t,this.count=e!==void 0?e.length/t:0,this.normalized=i,this.usage=of,this.updateRanges=[],this.gpuType=Di,this.version=0}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.usage=e.usage,this.gpuType=e.gpuType,this}copyAt(e,t,i){e*=this.itemSize,i*=t.itemSize;for(let n=0,s=this.itemSize;n<s;n++)this.array[e+n]=t.array[i+n];return this}copyArray(e){return this.array.set(e),this}applyMatrix3(e){if(this.itemSize===2)for(let t=0,i=this.count;t<i;t++)Zs.fromBufferAttribute(this,t),Zs.applyMatrix3(e),this.setXY(t,Zs.x,Zs.y);else if(this.itemSize===3)for(let t=0,i=this.count;t<i;t++)Et.fromBufferAttribute(this,t),Et.applyMatrix3(e),this.setXYZ(t,Et.x,Et.y,Et.z);return this}applyMatrix4(e){for(let t=0,i=this.count;t<i;t++)Et.fromBufferAttribute(this,t),Et.applyMatrix4(e),this.setXYZ(t,Et.x,Et.y,Et.z);return this}applyNormalMatrix(e){for(let t=0,i=this.count;t<i;t++)Et.fromBufferAttribute(this,t),Et.applyNormalMatrix(e),this.setXYZ(t,Et.x,Et.y,Et.z);return this}transformDirection(e){for(let t=0,i=this.count;t<i;t++)Et.fromBufferAttribute(this,t),Et.transformDirection(e),this.setXYZ(t,Et.x,Et.y,Et.z);return this}set(e,t=0){return this.array.set(e,t),this}getComponent(e,t){let i=this.array[e*this.itemSize+t];return this.normalized&&(i=ls(i,this.array)),i}setComponent(e,t,i){return this.normalized&&(i=zt(i,this.array)),this.array[e*this.itemSize+t]=i,this}getX(e){let t=this.array[e*this.itemSize];return this.normalized&&(t=ls(t,this.array)),t}setX(e,t){return this.normalized&&(t=zt(t,this.array)),this.array[e*this.itemSize]=t,this}getY(e){let t=this.array[e*this.itemSize+1];return this.normalized&&(t=ls(t,this.array)),t}setY(e,t){return this.normalized&&(t=zt(t,this.array)),this.array[e*this.itemSize+1]=t,this}getZ(e){let t=this.array[e*this.itemSize+2];return this.normalized&&(t=ls(t,this.array)),t}setZ(e,t){return this.normalized&&(t=zt(t,this.array)),this.array[e*this.itemSize+2]=t,this}getW(e){let t=this.array[e*this.itemSize+3];return this.normalized&&(t=ls(t,this.array)),t}setW(e,t){return this.normalized&&(t=zt(t,this.array)),this.array[e*this.itemSize+3]=t,this}setXY(e,t,i){return e*=this.itemSize,this.normalized&&(t=zt(t,this.array),i=zt(i,this.array)),this.array[e+0]=t,this.array[e+1]=i,this}setXYZ(e,t,i,n){return e*=this.itemSize,this.normalized&&(t=zt(t,this.array),i=zt(i,this.array),n=zt(n,this.array)),this.array[e+0]=t,this.array[e+1]=i,this.array[e+2]=n,this}setXYZW(e,t,i,n,s){return e*=this.itemSize,this.normalized&&(t=zt(t,this.array),i=zt(i,this.array),n=zt(n,this.array),s=zt(s,this.array)),this.array[e+0]=t,this.array[e+1]=i,this.array[e+2]=n,this.array[e+3]=s,this}onUpload(e){return this.onUploadCallback=e,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){const e={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return e.name=this.name,e.usage=this.usage,e.gpuType=this.gpuType,e}dispose(){this.dispatchEvent({type:"dispose"})}}class Nu extends Ji{constructor(e,t,i){super(new Uint16Array(e),t,i)}}class Fu extends Ji{constructor(e,t,i){super(new Uint32Array(e),t,i)}}class Zi extends Ji{constructor(e,t,i){super(new Float32Array(e),t,i)}}const Cf=new Us,us=new z,Ra=new z;class rl{constructor(e=new z,t=-1){this.isSphere=!0,this.center=e,this.radius=t}set(e,t){return this.center.copy(e),this.radius=t,this}setFromPoints(e,t){const i=this.center;t!==void 0?i.copy(t):Cf.setFromPoints(e).getCenter(i);let n=0;for(let s=0,a=e.length;s<a;s++)n=Math.max(n,i.distanceToSquared(e[s]));return this.radius=Math.sqrt(n),this}copy(e){return this.center.copy(e.center),this.radius=e.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(e){return e.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(e){return e.distanceTo(this.center)-this.radius}intersectsSphere(e){const t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t}intersectsBox(e){return e.intersectsSphere(this)}intersectsPlane(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius}clampPoint(e,t){const i=this.center.distanceToSquared(e);return t.copy(e),i>this.radius*this.radius&&(t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center)),t}getBoundingBox(e){return this.isEmpty()?(e.makeEmpty(),e):(e.set(this.center,this.center),e.expandByScalar(this.radius),e)}applyMatrix4(e){return this.center.applyMatrix4(e),this.radius=this.radius*e.getMaxScaleOnAxis(),this}translate(e){return this.center.add(e),this}expandByPoint(e){if(this.isEmpty())return this.center.copy(e),this.radius=0,this;us.subVectors(e,this.center);const t=us.lengthSq();if(t>this.radius*this.radius){const i=Math.sqrt(t),n=(i-this.radius)*.5;this.center.addScaledVector(us,n/i),this.radius+=n}return this}union(e){return e.isEmpty()?this:this.isEmpty()?(this.copy(e),this):(this.center.equals(e.center)===!0?this.radius=Math.max(this.radius,e.radius):(Ra.subVectors(e.center,this.center).setLength(e.radius),this.expandByPoint(us.copy(e.center).add(Ra)),this.expandByPoint(us.copy(e.center).sub(Ra))),this)}equals(e){return e.center.equals(this.center)&&e.radius===this.radius}clone(){return new this.constructor().copy(this)}toJSON(){return{radius:this.radius,center:this.center.toArray()}}fromJSON(e){return this.radius=e.radius,this.center.fromArray(e.center),this}}let Rf=0;const ri=new wt,Pa=new ni,Vn=new z,$t=new Us,ds=new Us,Pt=new z;class en extends Dn{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:Rf++}),this.uuid=Os(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.indirectOffset=0,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={},this._transformed=!1}getIndex(){return this.index}setIndex(e){return Array.isArray(e)?this.index=new(lf(e)?Fu:Nu)(e,1):this.index=e,this}setIndirect(e,t=0){return this.indirect=e,this.indirectOffset=t,this}getIndirect(){return this.indirect}getAttribute(e){return this.attributes[e]}setAttribute(e,t){return this.attributes[e]=t,this}deleteAttribute(e){return delete this.attributes[e],this}hasAttribute(e){return this.attributes[e]!==void 0}addGroup(e,t,i=0){this.groups.push({start:e,count:t,materialIndex:i})}clearGroups(){this.groups=[]}setDrawRange(e,t){this.drawRange.start=e,this.drawRange.count=t}applyMatrix4(e){const t=this.attributes.position;t!==void 0&&(t.applyMatrix4(e),t.needsUpdate=!0);const i=this.attributes.normal;if(i!==void 0){const s=new Ie().getNormalMatrix(e);i.applyNormalMatrix(s),i.needsUpdate=!0}const n=this.attributes.tangent;return n!==void 0&&(n.transformDirection(e),n.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this._transformed=!0,this}applyQuaternion(e){return ri.makeRotationFromQuaternion(e),this.applyMatrix4(ri),this}rotateX(e){return ri.makeRotationX(e),this.applyMatrix4(ri),this}rotateY(e){return ri.makeRotationY(e),this.applyMatrix4(ri),this}rotateZ(e){return ri.makeRotationZ(e),this.applyMatrix4(ri),this}translate(e,t,i){return ri.makeTranslation(e,t,i),this.applyMatrix4(ri),this}scale(e,t,i){return ri.makeScale(e,t,i),this.applyMatrix4(ri),this}lookAt(e){return Pa.lookAt(e),Pa.updateMatrix(),this.applyMatrix4(Pa.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(Vn).negate(),this.translate(Vn.x,Vn.y,Vn.z),this}setFromPoints(e){const t=this.getAttribute("position");if(t===void 0){const i=[];for(let n=0,s=e.length;n<s;n++){const a=e[n];i.push(a.x,a.y,a.z||0)}this.setAttribute("position",new Zi(i,3))}else{const i=Math.min(e.length,t.count);for(let n=0;n<i;n++){const s=e[n];t.setXYZ(n,s.x,s.y,s.z||0)}e.length>t.count&&Re("BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),t.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new Us);const e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){Ke("BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new z(-1/0,-1/0,-1/0),new z(1/0,1/0,1/0));return}if(e!==void 0){if(this.boundingBox.setFromBufferAttribute(e),t)for(let i=0,n=t.length;i<n;i++){const s=t[i];$t.setFromBufferAttribute(s),this.morphTargetsRelative?(Pt.addVectors(this.boundingBox.min,$t.min),this.boundingBox.expandByPoint(Pt),Pt.addVectors(this.boundingBox.max,$t.max),this.boundingBox.expandByPoint(Pt)):(this.boundingBox.expandByPoint($t.min),this.boundingBox.expandByPoint($t.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&Ke('BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new rl);const e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){Ke("BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new z,1/0);return}if(e){const i=this.boundingSphere.center;if($t.setFromBufferAttribute(e),t)for(let s=0,a=t.length;s<a;s++){const o=t[s];ds.setFromBufferAttribute(o),this.morphTargetsRelative?(Pt.addVectors($t.min,ds.min),$t.expandByPoint(Pt),Pt.addVectors($t.max,ds.max),$t.expandByPoint(Pt)):($t.expandByPoint(ds.min),$t.expandByPoint(ds.max))}$t.getCenter(i);let n=0;for(let s=0,a=e.count;s<a;s++)Pt.fromBufferAttribute(e,s),n=Math.max(n,i.distanceToSquared(Pt));if(t)for(let s=0,a=t.length;s<a;s++){const o=t[s],l=this.morphTargetsRelative;for(let c=0,h=o.count;c<h;c++)Pt.fromBufferAttribute(o,c),l&&(Vn.fromBufferAttribute(e,c),Pt.add(Vn)),n=Math.max(n,i.distanceToSquared(Pt))}this.boundingSphere.radius=Math.sqrt(n),isNaN(this.boundingSphere.radius)&&Ke('BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){const e=this.index,t=this.attributes;if(e===null||t.position===void 0||t.normal===void 0||t.uv===void 0){Ke("BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}const i=t.position,n=t.normal,s=t.uv;let a=this.getAttribute("tangent");(a===void 0||a.count!==i.count)&&(a=new Ji(new Float32Array(4*i.count),4),this.setAttribute("tangent",a));const o=[],l=[];for(let g=0;g<i.count;g++)o[g]=new z,l[g]=new z;const c=new z,h=new z,d=new z,u=new Ge,f=new Ge,m=new Ge,y=new z,p=new z;function _(g,w,R){c.fromBufferAttribute(i,g),h.fromBufferAttribute(i,w),d.fromBufferAttribute(i,R),u.fromBufferAttribute(s,g),f.fromBufferAttribute(s,w),m.fromBufferAttribute(s,R),h.sub(c),d.sub(c),f.sub(u),m.sub(u);const P=1/(f.x*m.y-m.x*f.y);isFinite(P)&&(y.copy(h).multiplyScalar(m.y).addScaledVector(d,-f.y).multiplyScalar(P),p.copy(d).multiplyScalar(f.x).addScaledVector(h,-m.x).multiplyScalar(P),o[g].add(y),o[w].add(y),o[R].add(y),l[g].add(p),l[w].add(p),l[R].add(p))}let T=this.groups;T.length===0&&(T=[{start:0,count:e.count}]);for(let g=0,w=T.length;g<w;++g){const R=T[g],P=R.start,O=R.count;for(let B=P,N=P+O;B<N;B+=3)_(e.getX(B+0),e.getX(B+1),e.getX(B+2))}const A=new z,S=new z,M=new z,E=new z;function C(g){M.fromBufferAttribute(n,g),E.copy(M);const w=o[g];A.copy(w),A.sub(M.multiplyScalar(M.dot(w))).normalize(),S.crossVectors(E,w);const P=S.dot(l[g])<0?-1:1;a.setXYZW(g,A.x,A.y,A.z,P)}for(let g=0,w=T.length;g<w;++g){const R=T[g],P=R.start,O=R.count;for(let B=P,N=P+O;B<N;B+=3)C(e.getX(B+0)),C(e.getX(B+1)),C(e.getX(B+2))}this._transformed=!0}computeVertexNormals(){const e=this.index,t=this.getAttribute("position");if(t!==void 0){let i=this.getAttribute("normal");if(i===void 0||i.count!==t.count)i=new Ji(new Float32Array(t.count*3),3),this.setAttribute("normal",i);else for(let u=0,f=i.count;u<f;u++)i.setXYZ(u,0,0,0);const n=new z,s=new z,a=new z,o=new z,l=new z,c=new z,h=new z,d=new z;if(e)for(let u=0,f=e.count;u<f;u+=3){const m=e.getX(u+0),y=e.getX(u+1),p=e.getX(u+2);n.fromBufferAttribute(t,m),s.fromBufferAttribute(t,y),a.fromBufferAttribute(t,p),h.subVectors(a,s),d.subVectors(n,s),h.cross(d),o.fromBufferAttribute(i,m),l.fromBufferAttribute(i,y),c.fromBufferAttribute(i,p),o.add(h),l.add(h),c.add(h),i.setXYZ(m,o.x,o.y,o.z),i.setXYZ(y,l.x,l.y,l.z),i.setXYZ(p,c.x,c.y,c.z)}else for(let u=0,f=t.count;u<f;u+=3)n.fromBufferAttribute(t,u+0),s.fromBufferAttribute(t,u+1),a.fromBufferAttribute(t,u+2),h.subVectors(a,s),d.subVectors(n,s),h.cross(d),i.setXYZ(u+0,h.x,h.y,h.z),i.setXYZ(u+1,h.x,h.y,h.z),i.setXYZ(u+2,h.x,h.y,h.z);this.normalizeNormals(),i.needsUpdate=!0}}normalizeNormals(){const e=this.attributes.normal;for(let t=0,i=e.count;t<i;t++)Pt.fromBufferAttribute(e,t),Pt.normalize(),e.setXYZ(t,Pt.x,Pt.y,Pt.z)}toNonIndexed(){function e(o,l){const c=o.array,h=o.itemSize,d=o.normalized,u=new c.constructor(l.length*h);let f=0,m=0;for(let y=0,p=l.length;y<p;y++){o.isInterleavedBufferAttribute?f=l[y]*o.data.stride+o.offset:f=l[y]*h;for(let _=0;_<h;_++)u[m++]=c[f++]}return new Ji(u,h,d)}if(this.index===null)return Re("BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;const t=new en,i=this.index.array,n=this.attributes;for(const o in n){const l=n[o],c=e(l,i);t.setAttribute(o,c)}const s=this.morphAttributes;for(const o in s){const l=[],c=s[o];for(let h=0,d=c.length;h<d;h++){const u=c[h],f=e(u,i);l.push(f)}t.morphAttributes[o]=l}t.morphTargetsRelative=this.morphTargetsRelative;const a=this.groups;for(let o=0,l=a.length;o<l;o++){const c=a[o];t.addGroup(c.start,c.count,c.materialIndex)}return t}toJSON(){const e={metadata:{version:4.7,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(e.uuid=this.uuid,e.type=this.parameters!==void 0&&this._transformed===!0?"BufferGeometry":this.type,e.name=this.name,Object.keys(this.userData).length>0&&(e.userData=this.userData),this.parameters!==void 0&&this._transformed!==!0){const l=this.parameters;for(const c in l)l[c]!==void 0&&(e[c]=l[c]);return e}e.data={attributes:{}};const t=this.index;t!==null&&(e.data.index={type:t.array.constructor.name,array:Array.prototype.slice.call(t.array)});const i=this.attributes;for(const l in i){const c=i[l];e.data.attributes[l]=c.toJSON(e.data)}const n={};let s=!1;for(const l in this.morphAttributes){const c=this.morphAttributes[l],h=[];for(let d=0,u=c.length;d<u;d++){const f=c[d];h.push(f.toJSON(e.data))}h.length>0&&(n[l]=h,s=!0)}s&&(e.data.morphAttributes=n,e.data.morphTargetsRelative=this.morphTargetsRelative);const a=this.groups;a.length>0&&(e.data.groups=JSON.parse(JSON.stringify(a)));const o=this.boundingSphere;return o!==null&&(e.data.boundingSphere=o.toJSON()),e}clone(){return new this.constructor().copy(this)}copy(e){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;const t={};this.name=e.name;const i=e.index;i!==null&&this.setIndex(i.clone());const n=e.attributes;for(const c in n){const h=n[c];this.setAttribute(c,h.clone(t))}const s=e.morphAttributes;for(const c in s){const h=[],d=s[c];for(let u=0,f=d.length;u<f;u++)h.push(d[u].clone(t));this.morphAttributes[c]=h}this.morphTargetsRelative=e.morphTargetsRelative;const a=e.groups;for(let c=0,h=a.length;c<h;c++){const d=a[c];this.addGroup(d.start,d.count,d.materialIndex)}const o=e.boundingBox;o!==null&&(this.boundingBox=o.clone());const l=e.boundingSphere;return l!==null&&(this.boundingSphere=l.clone()),this.drawRange.start=e.drawRange.start,this.drawRange.count=e.drawRange.count,this.userData=e.userData,this._transformed=e._transformed,this}dispose(){this.dispatchEvent({type:"dispose"})}}const Ia=new z,Pf=new z,If=new Ie;class dn{constructor(e=new z(1,0,0),t=0){this.isPlane=!0,this.normal=e,this.constant=t}set(e,t){return this.normal.copy(e),this.constant=t,this}setComponents(e,t,i,n){return this.normal.set(e,t,i),this.constant=n,this}setFromNormalAndCoplanarPoint(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this}setFromCoplanarPoints(e,t,i){const n=Ia.subVectors(i,t).cross(Pf.subVectors(e,t)).normalize();return this.setFromNormalAndCoplanarPoint(n,e),this}copy(e){return this.normal.copy(e.normal),this.constant=e.constant,this}normalize(){const e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(e){return this.normal.dot(e)+this.constant}distanceToSphere(e){return this.distanceToPoint(e.center)-e.radius}projectPoint(e,t){return t.copy(e).addScaledVector(this.normal,-this.distanceToPoint(e))}intersectLine(e,t,i=!0){const n=e.delta(Ia),s=this.normal.dot(n);if(s===0)return this.distanceToPoint(e.start)===0?t.copy(e.start):null;const a=-(e.start.dot(this.normal)+this.constant)/s;return i===!0&&(a<0||a>1)?null:t.copy(e.start).addScaledVector(n,a)}intersectsLine(e){const t=this.distanceToPoint(e.start),i=this.distanceToPoint(e.end);return t<0&&i>0||i<0&&t>0}intersectsBox(e){return e.intersectsPlane(this)}intersectsSphere(e){return e.intersectsPlane(this)}coplanarPoint(e){return e.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(e,t){const i=t||If.getNormalMatrix(e),n=this.coplanarPoint(Ia).applyMatrix4(e),s=this.normal.applyMatrix3(i).normalize();return this.constant=-n.dot(s),this}translate(e){return this.constant-=e.dot(this.normal),this}equals(e){return e.normal.equals(this.normal)&&e.constant===this.constant}clone(){return new this.constructor().copy(this)}toJSON(){return{normal:this.normal.toArray(),constant:this.constant}}fromJSON(e){return this.normal.fromArray(e.normal),this.constant=e.constant,this}}let Df=0;class Jr extends Dn{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:Df++}),this.uuid=Os(),this.name="",this.type="Material",this.blending=Rs,this.side=Cn,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=du,this.blendDst=fu,this.blendEquation=Jn,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new Xe(0,0,0),this.blendAlpha=0,this.depthFunc=Is,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=Qd,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=ua,this.stencilZFail=ua,this.stencilZPass=ua,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.allowOverride=!0,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(e){this._alphaTest>0!=e>0&&this.version++,this._alphaTest=e}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(e){if(e!==void 0)for(const t in e){const i=e[t];if(i===void 0){Re(`Material: parameter '${t}' has value of undefined.`);continue}const n=this[t];if(n===void 0){Re(`Material: '${t}' is not a property of THREE.${this.type}.`);continue}n&&n.isColor?n.set(i):n&&n.isVector2&&i&&i.isVector2||n&&n.isEuler&&i&&i.isEuler||n&&n.isVector3&&i&&i.isVector3?n.copy(i):this[t]=i}}toJSON(e){const t=e===void 0||typeof e=="string";t&&(e={textures:{},images:{}});const i={metadata:{version:4.7,type:"Material",generator:"Material.toJSON"}};i.uuid=this.uuid,i.type=this.type,i.blending=this.blending,i.side=this.side,i.shadowSide=this.shadowSide,i.vertexColors=this.vertexColors,i.opacity=this.opacity,i.transparent=this.transparent,i.blendSrc=this.blendSrc,i.blendDst=this.blendDst,i.blendEquation=this.blendEquation,i.blendSrcAlpha=this.blendSrcAlpha,i.blendDstAlpha=this.blendDstAlpha,i.blendEquationAlpha=this.blendEquationAlpha,i.blendColor=this.blendColor.getHex(),i.blendAlpha=this.blendAlpha,i.depthFunc=this.depthFunc,i.depthTest=this.depthTest,i.depthWrite=this.depthWrite,i.colorWrite=this.colorWrite,i.clipIntersection=this.clipIntersection,i.clipShadows=this.clipShadows,i.stencilWriteMask=this.stencilWriteMask,i.stencilFunc=this.stencilFunc,i.stencilRef=this.stencilRef,i.stencilFuncMask=this.stencilFuncMask,i.stencilFail=this.stencilFail,i.stencilZFail=this.stencilZFail,i.stencilZPass=this.stencilZPass,i.stencilWrite=this.stencilWrite,i.polygonOffset=this.polygonOffset,i.polygonOffsetFactor=this.polygonOffsetFactor,i.polygonOffsetUnits=this.polygonOffsetUnits,i.dithering=this.dithering,i.alphaTest=this.alphaTest,i.alphaHash=this.alphaHash,i.alphaToCoverage=this.alphaToCoverage,i.premultipliedAlpha=this.premultipliedAlpha,i.forceSinglePass=this.forceSinglePass,i.allowOverride=this.allowOverride,i.visible=this.visible,i.toneMapped=this.toneMapped,i.name=this.name,this.color&&this.color.isColor&&(i.color=this.color.getHex()),this.roughness!==void 0&&(i.roughness=this.roughness),this.metalness!==void 0&&(i.metalness=this.metalness),this.sheen!==void 0&&(i.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(i.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(i.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(i.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&(i.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(i.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(i.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(i.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(i.shininess=this.shininess),this.clearcoat!==void 0&&(i.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(i.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(i.clearcoatMap=this.clearcoatMap.toJSON(e).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(i.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(e).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(i.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(e).uuid,i.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.sheenColorMap&&this.sheenColorMap.isTexture&&(i.sheenColorMap=this.sheenColorMap.toJSON(e).uuid),this.sheenRoughnessMap&&this.sheenRoughnessMap.isTexture&&(i.sheenRoughnessMap=this.sheenRoughnessMap.toJSON(e).uuid),this.dispersion!==void 0&&(i.dispersion=this.dispersion),this.retroreflectivity!==void 0&&(i.retroreflectivity=this.retroreflectivity),this.iridescence!==void 0&&(i.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(i.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(i.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(i.iridescenceMap=this.iridescenceMap.toJSON(e).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(i.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(e).uuid),this.anisotropy!==void 0&&(i.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(i.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(i.anisotropyMap=this.anisotropyMap.toJSON(e).uuid),this.map&&this.map.isTexture&&(i.map=this.map.toJSON(e).uuid),this.matcap&&this.matcap.isTexture&&(i.matcap=this.matcap.toJSON(e).uuid),this.alphaMap&&this.alphaMap.isTexture&&(i.alphaMap=this.alphaMap.toJSON(e).uuid),this.lightMap&&this.lightMap.isTexture&&(i.lightMap=this.lightMap.toJSON(e).uuid,i.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(i.aoMap=this.aoMap.toJSON(e).uuid,i.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(i.bumpMap=this.bumpMap.toJSON(e).uuid,i.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(i.normalMap=this.normalMap.toJSON(e).uuid,i.normalMapType=this.normalMapType,i.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(i.displacementMap=this.displacementMap.toJSON(e).uuid,i.displacementScale=this.displacementScale,i.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(i.roughnessMap=this.roughnessMap.toJSON(e).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(i.metalnessMap=this.metalnessMap.toJSON(e).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(i.emissiveMap=this.emissiveMap.toJSON(e).uuid),this.specularMap&&this.specularMap.isTexture&&(i.specularMap=this.specularMap.toJSON(e).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(i.specularIntensityMap=this.specularIntensityMap.toJSON(e).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(i.specularColorMap=this.specularColorMap.toJSON(e).uuid),this.envMap&&this.envMap.isTexture&&(i.envMap=this.envMap.toJSON(e).uuid,this.combine!==void 0&&(i.combine=this.combine)),this.envMapRotation!==void 0&&(i.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(i.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(i.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(i.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(i.gradientMap=this.gradientMap.toJSON(e).uuid),this.transmission!==void 0&&(i.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(i.transmissionMap=this.transmissionMap.toJSON(e).uuid),this.thickness!==void 0&&(i.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(i.thicknessMap=this.thicknessMap.toJSON(e).uuid),this.attenuationDistance!==void 0&&(i.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(i.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(i.size=this.size),this.sizeAttenuation!==void 0&&(i.sizeAttenuation=this.sizeAttenuation),Array.isArray(this.clippingPlanes)&&this.clippingPlanes.length>0&&(i.clippingPlanes=this.clippingPlanes.map(s=>s.toJSON())),this.rotation!==void 0&&(i.rotation=this.rotation),this.depthPacking!==void 0&&(i.depthPacking=this.depthPacking),this.linewidth!==void 0&&(i.linewidth=this.linewidth),this.linecap!==void 0&&(i.linecap=this.linecap),this.linejoin!==void 0&&(i.linejoin=this.linejoin),this.dashSize!==void 0&&(i.dashSize=this.dashSize),this.gapSize!==void 0&&(i.gapSize=this.gapSize),this.scale!==void 0&&(i.scale=this.scale),this.wireframe!==void 0&&(i.wireframe=this.wireframe),this.wireframeLinewidth!==void 0&&(i.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!==void 0&&(i.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!==void 0&&(i.wireframeLinejoin=this.wireframeLinejoin),this.flatShading!==void 0&&(i.flatShading=this.flatShading),this.fog!==void 0&&(i.fog=this.fog),Object.keys(this.userData).length>0&&(i.userData=this.userData);function n(s){const a=[];for(const o in s){const l=s[o];delete l.metadata,a.push(l)}return a}if(t){const s=n(e.textures),a=n(e.images);s.length>0&&(i.textures=s),a.length>0&&(i.images=a)}return i}fromJSON(e,t){if(e.uuid!==void 0&&(this.uuid=e.uuid),e.name!==void 0&&(this.name=e.name),e.color!==void 0&&this.color!==void 0&&this.color.setHex(e.color),e.roughness!==void 0&&(this.roughness=e.roughness),e.metalness!==void 0&&(this.metalness=e.metalness),e.sheen!==void 0&&(this.sheen=e.sheen),e.sheenColor!==void 0&&(this.sheenColor=new Xe().setHex(e.sheenColor)),e.sheenRoughness!==void 0&&(this.sheenRoughness=e.sheenRoughness),e.emissive!==void 0&&this.emissive!==void 0&&this.emissive.setHex(e.emissive),e.specular!==void 0&&this.specular!==void 0&&this.specular.setHex(e.specular),e.specularIntensity!==void 0&&(this.specularIntensity=e.specularIntensity),e.specularColor!==void 0&&this.specularColor!==void 0&&this.specularColor.setHex(e.specularColor),e.shininess!==void 0&&(this.shininess=e.shininess),e.clearcoat!==void 0&&(this.clearcoat=e.clearcoat),e.clearcoatRoughness!==void 0&&(this.clearcoatRoughness=e.clearcoatRoughness),e.dispersion!==void 0&&(this.dispersion=e.dispersion),e.retroreflectivity!==void 0&&(this.retroreflectivity=e.retroreflectivity),e.iridescence!==void 0&&(this.iridescence=e.iridescence),e.iridescenceIOR!==void 0&&(this.iridescenceIOR=e.iridescenceIOR),e.iridescenceThicknessRange!==void 0&&(this.iridescenceThicknessRange=e.iridescenceThicknessRange),e.transmission!==void 0&&(this.transmission=e.transmission),e.thickness!==void 0&&(this.thickness=e.thickness),e.attenuationDistance!==void 0&&(this.attenuationDistance=e.attenuationDistance),e.attenuationColor!==void 0&&this.attenuationColor!==void 0&&this.attenuationColor.setHex(e.attenuationColor),e.anisotropy!==void 0&&(this.anisotropy=e.anisotropy),e.anisotropyRotation!==void 0&&(this.anisotropyRotation=e.anisotropyRotation),e.fog!==void 0&&(this.fog=e.fog),e.flatShading!==void 0&&(this.flatShading=e.flatShading),e.blending!==void 0&&(this.blending=e.blending),e.combine!==void 0&&(this.combine=e.combine),e.side!==void 0&&(this.side=e.side),e.shadowSide!==void 0&&(this.shadowSide=e.shadowSide),e.opacity!==void 0&&(this.opacity=e.opacity),e.transparent!==void 0&&(this.transparent=e.transparent),e.alphaTest!==void 0&&(this.alphaTest=e.alphaTest),e.alphaHash!==void 0&&(this.alphaHash=e.alphaHash),e.depthFunc!==void 0&&(this.depthFunc=e.depthFunc),e.depthTest!==void 0&&(this.depthTest=e.depthTest),e.depthWrite!==void 0&&(this.depthWrite=e.depthWrite),e.colorWrite!==void 0&&(this.colorWrite=e.colorWrite),e.clippingPlanes!==void 0&&(this.clippingPlanes=e.clippingPlanes.map(i=>new dn().fromJSON(i))),e.clipIntersection!==void 0&&(this.clipIntersection=e.clipIntersection),e.clipShadows!==void 0&&(this.clipShadows=e.clipShadows),e.depthPacking!==void 0&&(this.depthPacking=e.depthPacking),e.blendSrc!==void 0&&(this.blendSrc=e.blendSrc),e.blendDst!==void 0&&(this.blendDst=e.blendDst),e.blendEquation!==void 0&&(this.blendEquation=e.blendEquation),e.blendSrcAlpha!==void 0&&(this.blendSrcAlpha=e.blendSrcAlpha),e.blendDstAlpha!==void 0&&(this.blendDstAlpha=e.blendDstAlpha),e.blendEquationAlpha!==void 0&&(this.blendEquationAlpha=e.blendEquationAlpha),e.blendColor!==void 0&&this.blendColor!==void 0&&this.blendColor.setHex(e.blendColor),e.blendAlpha!==void 0&&(this.blendAlpha=e.blendAlpha),e.stencilWriteMask!==void 0&&(this.stencilWriteMask=e.stencilWriteMask),e.stencilFunc!==void 0&&(this.stencilFunc=e.stencilFunc),e.stencilRef!==void 0&&(this.stencilRef=e.stencilRef),e.stencilFuncMask!==void 0&&(this.stencilFuncMask=e.stencilFuncMask),e.stencilFail!==void 0&&(this.stencilFail=e.stencilFail),e.stencilZFail!==void 0&&(this.stencilZFail=e.stencilZFail),e.stencilZPass!==void 0&&(this.stencilZPass=e.stencilZPass),e.stencilWrite!==void 0&&(this.stencilWrite=e.stencilWrite),e.wireframe!==void 0&&(this.wireframe=e.wireframe),e.wireframeLinewidth!==void 0&&(this.wireframeLinewidth=e.wireframeLinewidth),e.wireframeLinecap!==void 0&&(this.wireframeLinecap=e.wireframeLinecap),e.wireframeLinejoin!==void 0&&(this.wireframeLinejoin=e.wireframeLinejoin),e.rotation!==void 0&&(this.rotation=e.rotation),e.linewidth!==void 0&&(this.linewidth=e.linewidth),e.linecap!==void 0&&(this.linecap=e.linecap),e.linejoin!==void 0&&(this.linejoin=e.linejoin),e.dashSize!==void 0&&(this.dashSize=e.dashSize),e.gapSize!==void 0&&(this.gapSize=e.gapSize),e.scale!==void 0&&(this.scale=e.scale),e.polygonOffset!==void 0&&(this.polygonOffset=e.polygonOffset),e.polygonOffsetFactor!==void 0&&(this.polygonOffsetFactor=e.polygonOffsetFactor),e.polygonOffsetUnits!==void 0&&(this.polygonOffsetUnits=e.polygonOffsetUnits),e.dithering!==void 0&&(this.dithering=e.dithering),e.alphaToCoverage!==void 0&&(this.alphaToCoverage=e.alphaToCoverage),e.premultipliedAlpha!==void 0&&(this.premultipliedAlpha=e.premultipliedAlpha),e.forceSinglePass!==void 0&&(this.forceSinglePass=e.forceSinglePass),e.allowOverride!==void 0&&(this.allowOverride=e.allowOverride),e.visible!==void 0&&(this.visible=e.visible),e.toneMapped!==void 0&&(this.toneMapped=e.toneMapped),e.userData!==void 0&&(this.userData=e.userData),e.vertexColors!==void 0&&(typeof e.vertexColors=="number"?this.vertexColors=e.vertexColors>0:this.vertexColors=e.vertexColors),e.size!==void 0&&(this.size=e.size),e.sizeAttenuation!==void 0&&(this.sizeAttenuation=e.sizeAttenuation),e.map!==void 0&&(this.map=t[e.map]||null),e.matcap!==void 0&&(this.matcap=t[e.matcap]||null),e.alphaMap!==void 0&&(this.alphaMap=t[e.alphaMap]||null),e.bumpMap!==void 0&&(this.bumpMap=t[e.bumpMap]||null),e.bumpScale!==void 0&&(this.bumpScale=e.bumpScale),e.normalMap!==void 0&&(this.normalMap=t[e.normalMap]||null),e.normalMapType!==void 0&&(this.normalMapType=e.normalMapType),e.normalScale!==void 0){let i=e.normalScale;Array.isArray(i)===!1&&(i=[i,i]),this.normalScale=new Ge().fromArray(i)}return e.displacementMap!==void 0&&(this.displacementMap=t[e.displacementMap]||null),e.displacementScale!==void 0&&(this.displacementScale=e.displacementScale),e.displacementBias!==void 0&&(this.displacementBias=e.displacementBias),e.roughnessMap!==void 0&&(this.roughnessMap=t[e.roughnessMap]||null),e.metalnessMap!==void 0&&(this.metalnessMap=t[e.metalnessMap]||null),e.emissiveMap!==void 0&&(this.emissiveMap=t[e.emissiveMap]||null),e.emissiveIntensity!==void 0&&(this.emissiveIntensity=e.emissiveIntensity),e.specularMap!==void 0&&(this.specularMap=t[e.specularMap]||null),e.specularIntensityMap!==void 0&&(this.specularIntensityMap=t[e.specularIntensityMap]||null),e.specularColorMap!==void 0&&(this.specularColorMap=t[e.specularColorMap]||null),e.envMap!==void 0&&(this.envMap=t[e.envMap]||null),e.envMapRotation!==void 0&&this.envMapRotation.fromArray(e.envMapRotation),e.envMapIntensity!==void 0&&(this.envMapIntensity=e.envMapIntensity),e.reflectivity!==void 0&&(this.reflectivity=e.reflectivity),e.refractionRatio!==void 0&&(this.refractionRatio=e.refractionRatio),e.lightMap!==void 0&&(this.lightMap=t[e.lightMap]||null),e.lightMapIntensity!==void 0&&(this.lightMapIntensity=e.lightMapIntensity),e.aoMap!==void 0&&(this.aoMap=t[e.aoMap]||null),e.aoMapIntensity!==void 0&&(this.aoMapIntensity=e.aoMapIntensity),e.gradientMap!==void 0&&(this.gradientMap=t[e.gradientMap]||null),e.clearcoatMap!==void 0&&(this.clearcoatMap=t[e.clearcoatMap]||null),e.clearcoatRoughnessMap!==void 0&&(this.clearcoatRoughnessMap=t[e.clearcoatRoughnessMap]||null),e.clearcoatNormalMap!==void 0&&(this.clearcoatNormalMap=t[e.clearcoatNormalMap]||null),e.clearcoatNormalScale!==void 0&&(this.clearcoatNormalScale=new Ge().fromArray(e.clearcoatNormalScale)),e.iridescenceMap!==void 0&&(this.iridescenceMap=t[e.iridescenceMap]||null),e.iridescenceThicknessMap!==void 0&&(this.iridescenceThicknessMap=t[e.iridescenceThicknessMap]||null),e.transmissionMap!==void 0&&(this.transmissionMap=t[e.transmissionMap]||null),e.thicknessMap!==void 0&&(this.thicknessMap=t[e.thicknessMap]||null),e.anisotropyMap!==void 0&&(this.anisotropyMap=t[e.anisotropyMap]||null),e.sheenColorMap!==void 0&&(this.sheenColorMap=t[e.sheenColorMap]||null),e.sheenRoughnessMap!==void 0&&(this.sheenRoughnessMap=t[e.sheenRoughnessMap]||null),this}clone(){return new this.constructor().copy(this)}copy(e){this.name=e.name,this.blending=e.blending,this.side=e.side,this.vertexColors=e.vertexColors,this.opacity=e.opacity,this.transparent=e.transparent,this.blendSrc=e.blendSrc,this.blendDst=e.blendDst,this.blendEquation=e.blendEquation,this.blendSrcAlpha=e.blendSrcAlpha,this.blendDstAlpha=e.blendDstAlpha,this.blendEquationAlpha=e.blendEquationAlpha,this.blendColor.copy(e.blendColor),this.blendAlpha=e.blendAlpha,this.depthFunc=e.depthFunc,this.depthTest=e.depthTest,this.depthWrite=e.depthWrite,this.stencilWriteMask=e.stencilWriteMask,this.stencilFunc=e.stencilFunc,this.stencilRef=e.stencilRef,this.stencilFuncMask=e.stencilFuncMask,this.stencilFail=e.stencilFail,this.stencilZFail=e.stencilZFail,this.stencilZPass=e.stencilZPass,this.stencilWrite=e.stencilWrite;const t=e.clippingPlanes;let i=null;if(t!==null){const n=t.length;i=new Array(n);for(let s=0;s!==n;++s)i[s]=t[s].clone()}return this.clippingPlanes=i,this.clipIntersection=e.clipIntersection,this.clipShadows=e.clipShadows,this.shadowSide=e.shadowSide,this.colorWrite=e.colorWrite,this.precision=e.precision,this.polygonOffset=e.polygonOffset,this.polygonOffsetFactor=e.polygonOffsetFactor,this.polygonOffsetUnits=e.polygonOffsetUnits,this.dithering=e.dithering,this.alphaTest=e.alphaTest,this.alphaHash=e.alphaHash,this.alphaToCoverage=e.alphaToCoverage,this.premultipliedAlpha=e.premultipliedAlpha,this.forceSinglePass=e.forceSinglePass,this.allowOverride=e.allowOverride,this.visible=e.visible,this.toneMapped=e.toneMapped,this.userData=JSON.parse(JSON.stringify(e.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(e){e===!0&&this.version++}}const zi=new z,Da=new z,Qs=new z,er=new z;class Lf{constructor(e=new z,t=new z(0,0,-1)){this.origin=e,this.direction=t}set(e,t){return this.origin.copy(e),this.direction.copy(t),this}copy(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this}at(e,t){return t.copy(this.origin).addScaledVector(this.direction,e)}lookAt(e){return this.direction.copy(e).sub(this.origin).normalize(),this}recast(e){return this.origin.copy(this.at(e,zi)),this}closestPointToPoint(e,t){t.subVectors(e,this.origin);const i=t.dot(this.direction);return i<0?t.copy(this.origin):t.copy(this.origin).addScaledVector(this.direction,i)}distanceToPoint(e){return Math.sqrt(this.distanceSqToPoint(e))}distanceSqToPoint(e){const t=zi.subVectors(e,this.origin).dot(this.direction);return t<0?this.origin.distanceToSquared(e):(zi.copy(this.origin).addScaledVector(this.direction,t),zi.distanceToSquared(e))}distanceSqToSegment(e,t,i,n){Da.copy(e).add(t).multiplyScalar(.5),Qs.copy(t).sub(e).normalize(),er.copy(this.origin).sub(Da);const s=e.distanceTo(t)*.5,a=-this.direction.dot(Qs),o=er.dot(this.direction),l=-er.dot(Qs),c=er.lengthSq(),h=Math.abs(1-a*a);let d,u,f,m;if(h>0)if(d=a*l-o,u=a*o-l,m=s*h,d>=0)if(u>=-m)if(u<=m){const y=1/h;d*=y,u*=y,f=d*(d+a*u+2*o)+u*(a*d+u+2*l)+c}else u=s,d=Math.max(0,-(a*u+o)),f=-d*d+u*(u+2*l)+c;else u=-s,d=Math.max(0,-(a*u+o)),f=-d*d+u*(u+2*l)+c;else u<=-m?(d=Math.max(0,-(-a*s+o)),u=d>0?-s:Math.min(Math.max(-s,-l),s),f=-d*d+u*(u+2*l)+c):u<=m?(d=0,u=Math.min(Math.max(-s,-l),s),f=u*(u+2*l)+c):(d=Math.max(0,-(a*s+o)),u=d>0?s:Math.min(Math.max(-s,-l),s),f=-d*d+u*(u+2*l)+c);else u=a>0?-s:s,d=Math.max(0,-(a*u+o)),f=-d*d+u*(u+2*l)+c;return i&&i.copy(this.origin).addScaledVector(this.direction,d),n&&n.copy(Da).addScaledVector(Qs,u),f}intersectSphere(e,t){if(e.radius<0)return null;zi.subVectors(e.center,this.origin);const i=zi.dot(this.direction),n=zi.dot(zi)-i*i,s=e.radius*e.radius;if(n>s)return null;const a=Math.sqrt(s-n),o=i-a,l=i+a;return l<0?null:o<0?this.at(l,t):this.at(o,t)}intersectsSphere(e){return e.radius<0?!1:this.distanceSqToPoint(e.center)<=e.radius*e.radius}distanceToPlane(e){const t=e.normal.dot(this.direction);if(t===0)return e.distanceToPoint(this.origin)===0?0:null;const i=-(this.origin.dot(e.normal)+e.constant)/t;return i>=0?i:null}intersectPlane(e,t){const i=this.distanceToPlane(e);return i===null?null:this.at(i,t)}intersectsPlane(e){const t=e.distanceToPoint(this.origin);return t===0||e.normal.dot(this.direction)*t<0}intersectBox(e,t){let i,n,s,a,o,l;const c=1/this.direction.x,h=1/this.direction.y,d=1/this.direction.z,u=this.origin;return c>=0?(i=(e.min.x-u.x)*c,n=(e.max.x-u.x)*c):(i=(e.max.x-u.x)*c,n=(e.min.x-u.x)*c),h>=0?(s=(e.min.y-u.y)*h,a=(e.max.y-u.y)*h):(s=(e.max.y-u.y)*h,a=(e.min.y-u.y)*h),i>a||s>n||((s>i||isNaN(i))&&(i=s),(a<n||isNaN(n))&&(n=a),d>=0?(o=(e.min.z-u.z)*d,l=(e.max.z-u.z)*d):(o=(e.max.z-u.z)*d,l=(e.min.z-u.z)*d),i>l||o>n)||((o>i||i!==i)&&(i=o),(l<n||n!==n)&&(n=l),n<0)?null:this.at(i>=0?i:n,t)}intersectsBox(e){return this.intersectBox(e,zi)!==null}intersectTriangle(e,t,i,n,s){const a=this.origin,o=this.direction,l=o.x,c=o.y,h=o.z,d=e.x-a.x,u=e.y-a.y,f=e.z-a.z,m=t.x-a.x,y=t.y-a.y,p=t.z-a.z,_=i.x-a.x,T=i.y-a.y,A=i.z-a.z,S=Math.abs(l),M=Math.abs(c),E=Math.abs(h);let C,g,w,R,P,O,B,N,H,J,V,ne;if(S>=M&&S>=E?(w=l,O=d,H=m,ne=_,l>=0?(C=c,g=h,R=u,P=f,B=y,N=p,J=T,V=A):(C=h,g=c,R=f,P=u,B=p,N=y,J=A,V=T)):M>=E?(w=c,O=u,H=y,ne=T,c>=0?(C=h,g=l,R=f,P=d,B=p,N=m,J=A,V=_):(C=l,g=h,R=d,P=f,B=m,N=p,J=_,V=A)):(w=h,O=f,H=p,ne=A,h>=0?(C=l,g=c,R=d,P=u,B=m,N=y,J=_,V=T):(C=c,g=l,R=u,P=d,B=y,N=m,J=T,V=_)),w===0)return null;const q=C/w,ee=g/w,ie=1/w,Ae=R-q*O,Te=P-ee*O,lt=B-q*H,qe=N-ee*H,je=J-q*ne,Y=V-ee*ne,Q=je*qe-Y*lt,xe=Ae*Y-Te*je,Pe=lt*Te-qe*Ae;if(n){if(Q<0||xe<0||Pe<0)return null}else if((Q<0||xe<0||Pe<0)&&(Q>0||xe>0||Pe>0))return null;const me=Q+xe+Pe;if(me===0)return null;const Fe=ie*(Q*O+xe*H+Pe*ne);return(me>0?Fe<0:Fe>0)?null:this.at(Fe/me,s)}applyMatrix4(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this}equals(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}}class Ou extends Jr{constructor(e){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new Xe(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new In,this.combine=pu,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.fog=e.fog,this}}const tc=new wt,yn=new Lf,tr=new rl,ic=new z,ir=new z,nr=new z,sr=new z,La=new z,rr=new z,nc=new z,ar=new z;class Ui extends ni{constructor(e=new en,t=new Ou){super(),this.isMesh=!0,this.type="Mesh",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.count=1,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=e.morphTargetInfluences.slice()),e.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary)),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}updateMorphTargets(){const t=this.geometry.morphAttributes,i=Object.keys(t);if(i.length>0){const n=t[i[0]];if(n!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let s=0,a=n.length;s<a;s++){const o=n[s].name||String(s);this.morphTargetInfluences.push(0),this.morphTargetDictionary[o]=s}}}}getVertexPosition(e,t){const i=this.geometry,n=i.attributes.position,s=i.morphAttributes.position,a=i.morphTargetsRelative;t.fromBufferAttribute(n,e);const o=this.morphTargetInfluences;if(s&&o){rr.set(0,0,0);for(let l=0,c=s.length;l<c;l++){const h=o[l],d=s[l];h!==0&&(La.fromBufferAttribute(d,e),a?rr.addScaledVector(La,h):rr.addScaledVector(La.sub(t),h))}t.add(rr)}return t}intersectsFrustum(e){return e.intersectsObject(this)}raycast(e,t){const i=this.geometry,n=this.material,s=this.matrixWorld;n!==void 0&&(i.boundingSphere===null&&i.computeBoundingSphere(),tr.copy(i.boundingSphere),tr.applyMatrix4(s),yn.copy(e.ray).recast(e.near),!(tr.containsPoint(yn.origin)===!1&&(yn.intersectSphere(tr,ic)===null||yn.origin.distanceToSquared(ic)>(e.far-e.near)**2))&&(tc.copy(s).invert(),yn.copy(e.ray).applyMatrix4(tc),!(i.boundingBox!==null&&yn.intersectsBox(i.boundingBox)===!1)&&this._computeIntersections(e,t,yn)))}_computeIntersections(e,t,i){let n;const s=this.geometry,a=this.material,o=s.index,l=s.attributes.position,c=s.attributes.uv,h=s.attributes.uv1,d=s.attributes.normal,u=s.groups,f=s.drawRange;if(o!==null)if(Array.isArray(a))for(let m=0,y=u.length;m<y;m++){const p=u[m],_=a[p.materialIndex],T=Math.max(p.start,f.start),A=Math.min(o.count,Math.min(p.start+p.count,f.start+f.count));for(let S=T,M=A;S<M;S+=3){const E=o.getX(S),C=o.getX(S+1),g=o.getX(S+2);n=or(this,_,e,i,c,h,d,E,C,g),n&&(n.faceIndex=Math.floor(S/3),n.face.materialIndex=p.materialIndex,t.push(n))}}else{const m=Math.max(0,f.start),y=Math.min(o.count,f.start+f.count);for(let p=m,_=y;p<_;p+=3){const T=o.getX(p),A=o.getX(p+1),S=o.getX(p+2);n=or(this,a,e,i,c,h,d,T,A,S),n&&(n.faceIndex=Math.floor(p/3),t.push(n))}}else if(l!==void 0)if(Array.isArray(a))for(let m=0,y=u.length;m<y;m++){const p=u[m],_=a[p.materialIndex],T=Math.max(p.start,f.start),A=Math.min(l.count,Math.min(p.start+p.count,f.start+f.count));for(let S=T,M=A;S<M;S+=3){const E=S,C=S+1,g=S+2;n=or(this,_,e,i,c,h,d,E,C,g),n&&(n.faceIndex=Math.floor(S/3),n.face.materialIndex=p.materialIndex,t.push(n))}}else{const m=Math.max(0,f.start),y=Math.min(l.count,f.start+f.count);for(let p=m,_=y;p<_;p+=3){const T=p,A=p+1,S=p+2;n=or(this,a,e,i,c,h,d,T,A,S),n&&(n.faceIndex=Math.floor(p/3),t.push(n))}}}}function Nf(r,e,t,i,n,s,a,o){let l;if(e.side===qt?l=i.intersectTriangle(a,s,n,!0,o):l=i.intersectTriangle(n,s,a,e.side===Cn,o),l===null)return null;ar.copy(o),ar.applyMatrix4(r.matrixWorld);const c=t.ray.origin.distanceTo(ar);return c<t.near||c>t.far?null:{distance:c,point:ar.clone(),object:r}}function or(r,e,t,i,n,s,a,o,l,c){r.getVertexPosition(o,ir),r.getVertexPosition(l,nr),r.getVertexPosition(c,sr);const h=Nf(r,e,t,i,ir,nr,sr,nc);if(h){const d=new z;xi.getBarycoord(nc,ir,nr,sr,d),n&&(h.uv=xi.getInterpolatedAttribute(n,o,l,c,d,new Ge)),s&&(h.uv1=xi.getInterpolatedAttribute(s,o,l,c,d,new Ge)),a&&(h.normal=xi.getInterpolatedAttribute(a,o,l,c,d,new z),h.normal.dot(i.direction)>0&&h.normal.multiplyScalar(-1));const u={a:o,b:l,c,normal:new z,materialIndex:0};xi.getNormal(ir,nr,sr,u.normal),h.face=u,h.barycoord=d}return h}class Uu extends kt{constructor(e=null,t=1,i=1,n,s,a,o,l,c=bt,h=bt,d,u){super(null,a,o,l,c,h,n,s,d,u),this.isDataTexture=!0,this.image={data:e,width:t,height:i},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}}const vn=new rl,Ff=new Ge(.5,.5),lr=new z;class ku{constructor(e=new dn,t=new dn,i=new dn,n=new dn,s=new dn,a=new dn){this.planes=[e,t,i,n,s,a]}set(e,t,i,n,s,a){const o=this.planes;return o[0].copy(e),o[1].copy(t),o[2].copy(i),o[3].copy(n),o[4].copy(s),o[5].copy(a),this}copy(e){const t=this.planes;for(let i=0;i<6;i++)t[i].copy(e.planes[i]);return this}setFromProjectionMatrix(e,t=Li,i=!1){const n=this.planes,s=e.elements,a=s[0],o=s[1],l=s[2],c=s[3],h=s[4],d=s[5],u=s[6],f=s[7],m=s[8],y=s[9],p=s[10],_=s[11],T=s[12],A=s[13],S=s[14],M=s[15];if(n[0].setComponents(c-a,f-h,_-m,M-T).normalize(),n[1].setComponents(c+a,f+h,_+m,M+T).normalize(),n[2].setComponents(c+o,f+d,_+y,M+A).normalize(),n[3].setComponents(c-o,f-d,_-y,M-A).normalize(),i)n[4].setComponents(l,u,p,S).normalize(),n[5].setComponents(c-l,f-u,_-p,M-S).normalize();else if(n[4].setComponents(c-l,f-u,_-p,M-S).normalize(),t===Li)n[5].setComponents(c+l,f+u,_+p,M+S).normalize();else if(t===zr)n[5].setComponents(l,u,p,S).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+t);return this}intersectsObject(e){if(e.boundingSphere!==void 0)e.boundingSphere===null&&e.computeBoundingSphere(),vn.copy(e.boundingSphere).applyMatrix4(e.matrixWorld);else{const t=e.geometry;t.boundingSphere===null&&t.computeBoundingSphere(),vn.copy(t.boundingSphere).applyMatrix4(e.matrixWorld)}return this.intersectsSphere(vn)}intersectsSprite(e){vn.center.set(0,0,0);const t=Ff.distanceTo(e.center);return vn.radius=.7071067811865476+t,vn.applyMatrix4(e.matrixWorld),this.intersectsSphere(vn)}intersectsSphere(e){const t=this.planes,i=e.center,n=-e.radius;for(let s=0;s<6;s++)if(t[s].distanceToPoint(i)<n)return!1;return!0}intersectsBox(e){const t=this.planes;for(let i=0;i<6;i++){const n=t[i];if(lr.x=n.normal.x>0?e.max.x:e.min.x,lr.y=n.normal.y>0?e.max.y:e.min.y,lr.z=n.normal.z>0?e.max.z:e.min.z,n.distanceToPoint(lr)<0)return!1}return!0}containsPoint(e){const t=this.planes;for(let i=0;i<6;i++)if(t[i].distanceToPoint(e)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}}class Bu extends kt{constructor(e=[],t=Rn,i,n,s,a,o,l,c,h){super(e,t,i,n,s,a,o,l,c,h),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(e){this.image=e}}class Of extends kt{constructor(e,t,i,n,s,a,o,l,c){super(e,t,i,n,s,a,o,l,c),this.isCanvasTexture=!0,this.needsUpdate=!0}}class Ns extends kt{constructor(e,t,i=Fi,n,s,a,o=bt,l=bt,c,h=Qi,d=1){if(h!==Qi&&h!==bn)throw new Error("THREE.DepthTexture: format must be either THREE.DepthFormat or THREE.DepthStencilFormat");const u={width:e,height:t,depth:d};super(u,n,s,a,o,l,h,i,c),this.isDepthTexture=!0,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(e){return super.copy(e),this.source=new sl(Object.assign({},e.image)),this.compareFunction=e.compareFunction,this}toJSON(e){const t=super.toJSON(e);return t.compareFunction=this.compareFunction,t}}class Uf extends Ns{constructor(e,t=Fi,i=Rn,n,s,a=bt,o=bt,l,c=Qi){const h={width:e,height:e,depth:1},d=[h,h,h,h,h,h];super(e,e,t,i,n,s,a,o,l,c),this.image=d,this.isCubeDepthTexture=!0,this.isCubeTexture=!0}get images(){return this.image}set images(e){this.image=e}}class Hu extends kt{constructor(e=null){super(),this.sourceTexture=e,this.isExternalTexture=!0}copy(e){return super.copy(e),this.sourceTexture=e.sourceTexture,this}}class ks extends en{constructor(e=1,t=1,i=1,n=1,s=1,a=1){super(),this.type="BoxGeometry",this.parameters={width:e,height:t,depth:i,widthSegments:n,heightSegments:s,depthSegments:a};const o=this;n=Math.floor(n),s=Math.floor(s),a=Math.floor(a);const l=[],c=[],h=[],d=[];let u=0,f=0;m("z","y","x",-1,-1,i,t,e,a,s,0),m("z","y","x",1,-1,i,t,-e,a,s,1),m("x","z","y",1,1,e,i,t,n,a,2),m("x","z","y",1,-1,e,i,-t,n,a,3),m("x","y","z",1,-1,e,t,i,n,s,4),m("x","y","z",-1,-1,e,t,-i,n,s,5),this.setIndex(l),this.setAttribute("position",new Zi(c,3)),this.setAttribute("normal",new Zi(h,3)),this.setAttribute("uv",new Zi(d,2));function m(y,p,_,T,A,S,M,E,C,g,w){const R=S/C,P=M/g,O=S/2,B=M/2,N=E/2,H=C+1,J=g+1;let V=0,ne=0;const q=new z;for(let ee=0;ee<J;ee++){const ie=ee*P-B;for(let Ae=0;Ae<H;Ae++){const Te=Ae*R-O;q[y]=Te*T,q[p]=ie*A,q[_]=N,c.push(q.x,q.y,q.z),q[y]=0,q[p]=0,q[_]=E>0?1:-1,h.push(q.x,q.y,q.z),d.push(Ae/C),d.push(1-ee/g),V+=1}}for(let ee=0;ee<g;ee++)for(let ie=0;ie<C;ie++){const Ae=u+ie+H*ee,Te=u+ie+H*(ee+1),lt=u+(ie+1)+H*(ee+1),qe=u+(ie+1)+H*ee;l.push(Ae,Te,qe),l.push(Te,lt,qe),ne+=6}o.addGroup(f,ne,w),f+=ne,u+=V}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new ks(e.width,e.height,e.depth,e.widthSegments,e.heightSegments,e.depthSegments)}}class Bs extends en{constructor(e=1,t=1,i=1,n=1){super(),this.type="PlaneGeometry",this.parameters={width:e,height:t,widthSegments:i,heightSegments:n};const s=e/2,a=t/2,o=Math.floor(i),l=Math.floor(n),c=o+1,h=l+1,d=e/o,u=t/l,f=[],m=[],y=[],p=[];for(let _=0;_<h;_++){const T=_*u-a;for(let A=0;A<c;A++){const S=A*d-s;m.push(S,-T,0),y.push(0,0,1),p.push(A/o),p.push(1-_/l)}}for(let _=0;_<l;_++)for(let T=0;T<o;T++){const A=T+c*_,S=T+c*(_+1),M=T+1+c*(_+1),E=T+1+c*_;f.push(A,S,E),f.push(S,M,E)}this.setIndex(f),this.setAttribute("position",new Zi(m,3)),this.setAttribute("normal",new Zi(y,3)),this.setAttribute("uv",new Zi(p,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new Bs(e.width,e.height,e.widthSegments,e.heightSegments)}}function rs(r){const e={};for(const t in r){e[t]={};for(const i in r[t]){const n=r[t][i];if(sc(n))n.isRenderTargetTexture?(Re("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),e[t][i]=null):e[t][i]=n.clone();else if(Array.isArray(n))if(sc(n[0])){const s=[];for(let a=0,o=n.length;a<o;a++)s[a]=n[a].clone();e[t][i]=s}else e[t][i]=n.slice();else e[t][i]=n}}return e}function Ht(r){const e={};for(let t=0;t<r.length;t++){const i=rs(r[t]);for(const n in i)e[n]=i[n]}return e}function sc(r){return r&&(r.isColor||r.isMatrix3||r.isMatrix4||r.isVector2||r.isVector3||r.isVector4||r.isTexture||r.isQuaternion)}function kf(r){const e=[];for(let t=0;t<r.length;t++)e.push(r[t].clone());return e}function Gu(r){const e=r.getRenderTarget();return e===null?r.outputColorSpace:e.isXRRenderTarget===!0?e.texture.colorSpace:We.workingColorSpace}const Bf={clone:rs,merge:Ht};var Hf=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,Gf=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`;class Si extends Jr{constructor(e){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=Hf,this.fragmentShader=Gf,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,e!==void 0&&this.setValues(e)}copy(e){return super.copy(e),this.fragmentShader=e.fragmentShader,this.vertexShader=e.vertexShader,this.uniforms=rs(e.uniforms),this.uniformsGroups=kf(e.uniformsGroups),this.defines=Object.assign({},e.defines),this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.fog=e.fog,this.lights=e.lights,this.clipping=e.clipping,this.extensions=Object.assign({},e.extensions),this.glslVersion=e.glslVersion,this.defaultAttributeValues=Object.assign({},e.defaultAttributeValues),this.index0AttributeName=e.index0AttributeName,this.uniformsNeedUpdate=e.uniformsNeedUpdate,this}toJSON(e){const t=super.toJSON(e);t.glslVersion=this.glslVersion,t.uniforms={};for(const n in this.uniforms){const a=this.uniforms[n].value;a&&a.isTexture?t.uniforms[n]={type:"t",value:a.toJSON(e).uuid}:a&&a.isColor?t.uniforms[n]={type:"c",value:a.getHex()}:a&&a.isVector2?t.uniforms[n]={type:"v2",value:a.toArray()}:a&&a.isVector3?t.uniforms[n]={type:"v3",value:a.toArray()}:a&&a.isVector4?t.uniforms[n]={type:"v4",value:a.toArray()}:a&&a.isMatrix3?t.uniforms[n]={type:"m3",value:a.toArray()}:a&&a.isMatrix4?t.uniforms[n]={type:"m4",value:a.toArray()}:t.uniforms[n]={value:a}}Object.keys(this.defines).length>0&&(t.defines=this.defines),t.vertexShader=this.vertexShader,t.fragmentShader=this.fragmentShader,t.lights=this.lights,t.clipping=this.clipping;const i={};for(const n in this.extensions)this.extensions[n]===!0&&(i[n]=!0);return Object.keys(i).length>0&&(t.extensions=i),t}fromJSON(e,t){if(super.fromJSON(e,t),e.uniforms!==void 0)for(const i in e.uniforms){const n=e.uniforms[i];switch(this.uniforms[i]={},n.type){case"t":this.uniforms[i].value=t[n.value]||null;break;case"c":this.uniforms[i].value=new Xe().setHex(n.value);break;case"v2":this.uniforms[i].value=new Ge().fromArray(n.value);break;case"v3":this.uniforms[i].value=new z().fromArray(n.value);break;case"v4":this.uniforms[i].value=new xt().fromArray(n.value);break;case"m3":this.uniforms[i].value=new Ie().fromArray(n.value);break;case"m4":this.uniforms[i].value=new wt().fromArray(n.value);break;default:this.uniforms[i].value=n.value}}if(e.defines!==void 0&&(this.defines=e.defines),e.vertexShader!==void 0&&(this.vertexShader=e.vertexShader),e.fragmentShader!==void 0&&(this.fragmentShader=e.fragmentShader),e.glslVersion!==void 0&&(this.glslVersion=e.glslVersion),e.extensions!==void 0)for(const i in e.extensions)this.extensions[i]=e.extensions[i];return e.lights!==void 0&&(this.lights=e.lights),e.clipping!==void 0&&(this.clipping=e.clipping),this}}class zf extends Si{constructor(e){super(e),this.isRawShaderMaterial=!0,this.type="RawShaderMaterial"}}class Wf extends Jr{constructor(e){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=Jd,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(e)}copy(e){return super.copy(e),this.depthPacking=e.depthPacking,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this}}class Vf extends Jr{constructor(e){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(e)}copy(e){return super.copy(e),this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this}}const cr=new z,hr=new as,wi=new z;let zu=class extends ni{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new wt,this.projectionMatrix=new wt,this.projectionMatrixInverse=new wt,this.coordinateSystem=Li,this._reversedDepth=!1}get reversedDepth(){return this._reversedDepth}copy(e,t){return super.copy(e,t),this.matrixWorldInverse.copy(e.matrixWorldInverse),this.projectionMatrix.copy(e.projectionMatrix),this.projectionMatrixInverse.copy(e.projectionMatrixInverse),this.coordinateSystem=e.coordinateSystem,this}getWorldDirection(e){return super.getWorldDirection(e).negate()}updateMatrixWorld(e){super.updateMatrixWorld(e),this.matrixWorld.decompose(cr,hr,wi),wi.x===1&&wi.y===1&&wi.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(cr,hr,wi.set(1,1,1)).invert()}updateWorldMatrix(e,t,i=!1){super.updateWorldMatrix(e,t,i),this.matrixWorld.decompose(cr,hr,wi),wi.x===1&&wi.y===1&&wi.z===1?this.matrixWorldInverse.copy(this.matrixWorld).invert():this.matrixWorldInverse.compose(cr,hr,wi.set(1,1,1)).invert()}clone(){return new this.constructor().copy(this)}};const cn=new z,rc=new Ge,ac=new Ge;class mi extends zu{constructor(e=50,t=1,i=.1,n=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=e,this.zoom=1,this.near=i,this.far=n,this.focus=10,this.aspect=t,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.fov=e.fov,this.zoom=e.zoom,this.near=e.near,this.far=e.far,this.focus=e.focus,this.aspect=e.aspect,this.view=e.view===null?null:Object.assign({},e.view),this.filmGauge=e.filmGauge,this.filmOffset=e.filmOffset,this}setFocalLength(e){const t=.5*this.getFilmHeight()/e;this.fov=qo*2*Math.atan(t),this.updateProjectionMatrix()}getFocalLength(){const e=Math.tan(da*.5*this.fov);return .5*this.getFilmHeight()/e}getEffectiveFOV(){return qo*2*Math.atan(Math.tan(da*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(e,t,i){cn.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),t.set(cn.x,cn.y).multiplyScalar(-e/cn.z),cn.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),i.set(cn.x,cn.y).multiplyScalar(-e/cn.z)}getViewSize(e,t){return this.getViewBounds(e,rc,ac),t.subVectors(ac,rc)}setViewOffset(e,t,i,n,s,a){this.aspect=e/t,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=i,this.view.offsetY=n,this.view.width=s,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const e=this.near;let t=e*Math.tan(da*.5*this.fov)/this.zoom,i=2*t,n=this.aspect*i,s=-.5*n;const a=this.view;if(this.view!==null&&this.view.enabled){const l=a.fullWidth,c=a.fullHeight;s+=a.offsetX*n/l,t-=a.offsetY*i/c,n*=a.width/l,i*=a.height/c}const o=this.filmOffset;o!==0&&(s+=e*o/this.getFilmWidth()),this.projectionMatrix.makePerspective(s,s+n,t,t-i,e,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){const t=super.toJSON(e);return t.object.fov=this.fov,t.object.zoom=this.zoom,t.object.near=this.near,t.object.far=this.far,t.object.focus=this.focus,t.object.aspect=this.aspect,this.view!==null&&(t.object.view=Object.assign({},this.view)),t.object.filmGauge=this.filmGauge,t.object.filmOffset=this.filmOffset,t}}class al extends zu{constructor(e=-1,t=1,i=1,n=-1,s=.1,a=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=e,this.right=t,this.top=i,this.bottom=n,this.near=s,this.far=a,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.left=e.left,this.right=e.right,this.top=e.top,this.bottom=e.bottom,this.near=e.near,this.far=e.far,this.zoom=e.zoom,this.view=e.view===null?null:Object.assign({},e.view),this}setViewOffset(e,t,i,n,s,a){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=i,this.view.offsetY=n,this.view.width=s,this.view.height=a,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const e=(this.right-this.left)/(2*this.zoom),t=(this.top-this.bottom)/(2*this.zoom),i=(this.right+this.left)/2,n=(this.top+this.bottom)/2;let s=i-e,a=i+e,o=n+t,l=n-t;if(this.view!==null&&this.view.enabled){const c=(this.right-this.left)/this.view.fullWidth/this.zoom,h=(this.top-this.bottom)/this.view.fullHeight/this.zoom;s+=c*this.view.offsetX,a=s+c*this.view.width,o-=h*this.view.offsetY,l=o-h*this.view.height}this.projectionMatrix.makeOrthographic(s,a,o,l,this.near,this.far,this.coordinateSystem,this.reversedDepth),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){const t=super.toJSON(e);return t.object.zoom=this.zoom,t.object.left=this.left,t.object.right=this.right,t.object.top=this.top,t.object.bottom=this.bottom,t.object.near=this.near,t.object.far=this.far,this.view!==null&&(t.object.view=Object.assign({},this.view)),t}}const Xn=-90,qn=1;class Xf extends ni{constructor(e,t,i){super(),this.type="CubeCamera",this.renderTarget=i,this.coordinateSystem=null,this.activeMipmapLevel=0;const n=new mi(Xn,qn,e,t);n.layers=this.layers,this.add(n);const s=new mi(Xn,qn,e,t);s.layers=this.layers,this.add(s);const a=new mi(Xn,qn,e,t);a.layers=this.layers,this.add(a);const o=new mi(Xn,qn,e,t);o.layers=this.layers,this.add(o);const l=new mi(Xn,qn,e,t);l.layers=this.layers,this.add(l);const c=new mi(Xn,qn,e,t);c.layers=this.layers,this.add(c)}updateCoordinateSystem(){const e=this.coordinateSystem,t=this.children.concat(),[i,n,s,a,o,l]=t;for(const c of t)this.remove(c);if(e===Li)i.up.set(0,1,0),i.lookAt(1,0,0),n.up.set(0,1,0),n.lookAt(-1,0,0),s.up.set(0,0,-1),s.lookAt(0,1,0),a.up.set(0,0,1),a.lookAt(0,-1,0),o.up.set(0,1,0),o.lookAt(0,0,1),l.up.set(0,1,0),l.lookAt(0,0,-1);else if(e===zr)i.up.set(0,-1,0),i.lookAt(-1,0,0),n.up.set(0,-1,0),n.lookAt(1,0,0),s.up.set(0,0,1),s.lookAt(0,1,0),a.up.set(0,0,-1),a.lookAt(0,-1,0),o.up.set(0,-1,0),o.lookAt(0,0,1),l.up.set(0,-1,0),l.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+e);for(const c of t)this.add(c),c.updateMatrixWorld()}update(e,t){this.parent===null&&this.updateMatrixWorld();const{renderTarget:i,activeMipmapLevel:n}=this;this.coordinateSystem!==e.coordinateSystem&&(this.coordinateSystem=e.coordinateSystem,this.updateCoordinateSystem());const[s,a,o,l,c,h]=this.children,d=e.getRenderTarget(),u=e.getActiveCubeFace(),f=e.getActiveMipmapLevel(),m=e.xr.enabled;e.xr.enabled=!1;const y=i.texture.generateMipmaps;i.texture.generateMipmaps=!1;let p=!1;e.isWebGLRenderer===!0?p=e.state.buffers.depth.getReversed():p=e.reversedDepthBuffer,e.setRenderTarget(i,0,n),p&&e.autoClear===!1&&e.clearDepth(),e.render(t,s),e.setRenderTarget(i,1,n),p&&e.autoClear===!1&&e.clearDepth(),e.render(t,a),e.setRenderTarget(i,2,n),p&&e.autoClear===!1&&e.clearDepth(),e.render(t,o),e.setRenderTarget(i,3,n),p&&e.autoClear===!1&&e.clearDepth(),e.render(t,l),e.setRenderTarget(i,4,n),p&&e.autoClear===!1&&e.clearDepth(),e.render(t,c),i.texture.generateMipmaps=y,e.setRenderTarget(i,5,n),p&&e.autoClear===!1&&e.clearDepth(),e.render(t,h),e.setRenderTarget(d,u,f),e.xr.enabled=m,i.texture.needsPMREMUpdate=!0}}class qf extends mi{constructor(e=[]){super(),this.isArrayCamera=!0,this.isMultiViewCamera=!1,this.cameras=e}}const dl=class dl{constructor(e,t,i,n){this.elements=[1,0,0,1],e!==void 0&&this.set(e,t,i,n)}identity(){return this.set(1,0,0,1),this}fromArray(e,t=0){for(let i=0;i<4;i++)this.elements[i]=e[i+t];return this}set(e,t,i,n){const s=this.elements;return s[0]=e,s[2]=t,s[1]=i,s[3]=n,this}};dl.prototype.isMatrix2=!0;let oc=dl;function lc(r,e,t,i){const n=Yf(i);switch(t){case Au:return r*e;case Ru:return r*e/n.components*n.byteLength;case Qo:return r*e/n.components*n.byteLength;case Pn:return r*e*2/n.components*n.byteLength;case el:return r*e*2/n.components*n.byteLength;case Cu:return r*e*3/n.components*n.byteLength;case ci:return r*e*4/n.components*n.byteLength;case tl:return r*e*4/n.components*n.byteLength;case Ir:case Dr:return Math.floor((r+3)/4)*Math.floor((e+3)/4)*8;case Lr:case Nr:return Math.floor((r+3)/4)*Math.floor((e+3)/4)*16;case go:case yo:return Math.max(r,16)*Math.max(e,8)/4;case mo:case xo:return Math.max(r,8)*Math.max(e,8)/2;case vo:case So:case Eo:case wo:return Math.floor((r+3)/4)*Math.floor((e+3)/4)*8;case Mo:case kr:case To:return Math.floor((r+3)/4)*Math.floor((e+3)/4)*16;case bo:return Math.floor((r+3)/4)*Math.floor((e+3)/4)*16;case Ao:return Math.floor((r+4)/5)*Math.floor((e+3)/4)*16;case Co:return Math.floor((r+4)/5)*Math.floor((e+4)/5)*16;case Ro:return Math.floor((r+5)/6)*Math.floor((e+4)/5)*16;case Po:return Math.floor((r+5)/6)*Math.floor((e+5)/6)*16;case Io:return Math.floor((r+7)/8)*Math.floor((e+4)/5)*16;case Do:return Math.floor((r+7)/8)*Math.floor((e+5)/6)*16;case Lo:return Math.floor((r+7)/8)*Math.floor((e+7)/8)*16;case No:return Math.floor((r+9)/10)*Math.floor((e+4)/5)*16;case Fo:return Math.floor((r+9)/10)*Math.floor((e+5)/6)*16;case Oo:return Math.floor((r+9)/10)*Math.floor((e+7)/8)*16;case Uo:return Math.floor((r+9)/10)*Math.floor((e+9)/10)*16;case ko:return Math.floor((r+11)/12)*Math.floor((e+9)/10)*16;case Bo:return Math.floor((r+11)/12)*Math.floor((e+11)/12)*16;case Ho:case Go:case zo:return Math.ceil(r/4)*Math.ceil(e/4)*16;case Wo:case Vo:return Math.ceil(r/4)*Math.ceil(e/4)*8;case Br:case Xo:return Math.ceil(r/4)*Math.ceil(e/4)*16}throw new Error(`Unable to determine texture byte length for ${t} format.`)}function Yf(r){switch(r){case ti:case Eu:return{byteLength:1,components:1};case Ds:case wu:case Oi:return{byteLength:2,components:1};case Jo:case Zo:return{byteLength:2,components:4};case Fi:case jo:case Di:return{byteLength:4,components:1};case Tu:case bu:return{byteLength:4,components:3}}throw new Error(`THREE.TextureUtils: Unknown texture type ${r}.`)}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:Ko}}));typeof window<"u"&&(window.__THREE__?Re("WARNING: Multiple instances of Three.js being imported."):window.__THREE__=Ko);/**
 * @license
 * Copyright 2010-2026 Three.js Authors
 * SPDX-License-Identifier: MIT
 */function Wu(){let r=null,e=!1,t=null,i=null;function n(s,a){i=r.requestAnimationFrame(n),t(s,a)}return{start:function(){e!==!0&&t!==null&&r!==null&&(i=r.requestAnimationFrame(n),e=!0)},stop:function(){r!==null&&r.cancelAnimationFrame(i),e=!1},setAnimationLoop:function(s){t=s},setContext:function(s){r=s}}}function $f(r){const e=new WeakMap;function t(o,l){const c=o.array,h=o.usage,d=c.byteLength,u=r.createBuffer();r.bindBuffer(l,u),r.bufferData(l,c,h),o.onUploadCallback();let f;if(c instanceof Float32Array)f=r.FLOAT;else if(typeof Float16Array<"u"&&c instanceof Float16Array)f=r.HALF_FLOAT;else if(c instanceof Uint16Array)o.isFloat16BufferAttribute?f=r.HALF_FLOAT:f=r.UNSIGNED_SHORT;else if(c instanceof Int16Array)f=r.SHORT;else if(c instanceof Uint32Array)f=r.UNSIGNED_INT;else if(c instanceof Int32Array)f=r.INT;else if(c instanceof Int8Array)f=r.BYTE;else if(c instanceof Uint8Array)f=r.UNSIGNED_BYTE;else if(c instanceof Uint8ClampedArray)f=r.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+c);return{buffer:u,type:f,bytesPerElement:c.BYTES_PER_ELEMENT,version:o.version,size:d}}function i(o,l,c){const h=l.array,d=l.updateRanges;if(r.bindBuffer(c,o),d.length===0)r.bufferSubData(c,0,h);else{d.sort((f,m)=>f.start-m.start);let u=0;for(let f=1;f<d.length;f++){const m=d[u],y=d[f];y.start<=m.start+m.count+1?m.count=Math.max(m.count,y.start+y.count-m.start):(++u,d[u]=y)}d.length=u+1;for(let f=0,m=d.length;f<m;f++){const y=d[f];r.bufferSubData(c,y.start*h.BYTES_PER_ELEMENT,h,y.start,y.count)}l.clearUpdateRanges()}l.onUploadCallback()}function n(o){return o.isInterleavedBufferAttribute&&(o=o.data),e.get(o)}function s(o){o.isInterleavedBufferAttribute&&(o=o.data);const l=e.get(o);l&&(r.deleteBuffer(l.buffer),e.delete(o))}function a(o,l){if(o.isInterleavedBufferAttribute&&(o=o.data),o.isGLBufferAttribute){const h=e.get(o);(!h||h.version<o.version)&&e.set(o,{buffer:o.buffer,type:o.type,bytesPerElement:o.elementSize,version:o.version});return}const c=e.get(o);if(c===void 0)e.set(o,t(o,l));else if(c.version<o.version){if(c.size!==o.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");i(c.buffer,o,l),c.version=o.version}}return{get:n,remove:s,update:a}}var Kf=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,jf=`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,Jf=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,Zf=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,Qf=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,ep=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,tp=`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,ip=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,np=`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec4 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 );
	}
#endif`,sp=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,rp=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,ap=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,op=`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,lp=`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,cp=`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,hp=`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,up=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,dp=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,fp=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,pp=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,_p=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,mp=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,gp=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
	vColor *= color;
#elif defined( USE_COLOR )
	vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.rgb *= instanceColor.rgb;
#endif
#ifdef USE_BATCHING_COLOR
	vColor *= getBatchingColor( getIndirectIndex( gl_DrawID ) );
#endif`,xp=`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
#define inverseTransformDirection transformDirectionByInverseViewMatrix
vec3 transformNormalByInverseViewMatrix( in vec3 normal, in mat4 viewMatrix ) {
	return normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
}
vec3 transformDirectionByInverseViewMatrix( in vec3 dir, in mat4 viewMatrix ) {
	return normalize( ( vec4( dir, 0.0 ) * viewMatrix ).xyz );
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,yp=`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,vp=`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
#endif`,Sp=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,Mp=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,Ep=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,wp=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,Tp="gl_FragColor = linearToOutputTexel( gl_FragColor );",bp=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,Ap=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * reflectVec );
		#ifdef ENVMAP_BLENDING_MULTIPLY
			outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_MIX )
			outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_ADD )
			outgoingLight += envColor.xyz * specularStrength * reflectivity;
		#endif
	#endif
#endif`,Cp=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
#endif`,Rp=`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,Pp=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,Ip=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,Dp=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,Lp=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,Np=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,Fp=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,Op=`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,Up=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,kp=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,Bp=`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,Hp=`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_SUN_LIGHTS > 0
	struct SunLight {
		vec3 direction;
		vec3 color;
	};
	uniform SunLight sunLights[ NUM_SUN_LIGHTS ];
	void getSunLightInfo( const in SunLight sunLight, out IncidentLight light ) {
		light.color = sunLight.color;
		light.direction = sunLight.direction;
		light.visible = true;
	}
#endif
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif
#include <lightprobes_pars_fragment>`,Gp=`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, pow4( roughness ) ) );
			reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_RETROREFLECTION
		vec3 getIBLRetroRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 retroVec = normalize( mix( viewDir, normal, pow4( roughness ) ) );
				retroVec = transformDirectionByInverseViewMatrix( retroVec, viewMatrix );
				vec4 envMapColor = textureCubeUV( envMap, envMapRotation * retroVec, roughness );
				return envMapColor.rgb * envMapIntensity;
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
		#ifdef USE_RETROREFLECTION
			vec3 getIBLAnisotropyRetroRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
				#ifdef ENVMAP_TYPE_CUBE_UV
					vec3 bentNormal = cross( bitangent, viewDir );
					bentNormal = normalize( cross( bentNormal, bitangent ) );
					bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
					return getIBLRetroRadiance( viewDir, bentNormal, roughness );
				#else
					return vec3( 0.0 );
				#endif
			}
		#endif
	#endif
#endif`,zp=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,Wp=`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,Vp=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,Xp=`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,qp=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.diffuseContribution = diffuseColor.rgb * ( 1.0 - metalnessFactor );
material.metalness = metalnessFactor;
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor;
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = vec3( 0.04 );
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_RETROREFLECTION
	material.retroreflectivity = retroreflectivity;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.0001, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,Yp=`uniform sampler2D dfgLUT;
struct PhysicalMaterial {
	vec3 diffuseColor;
	vec3 diffuseContribution;
	vec3 specularColor;
	vec3 specularColorBlended;
	float roughness;
	float metalness;
	float specularF90;
	float dispersion;
	vec2 dfg;
	vec3 multiScatteringCompensation;
	#ifdef USE_RETROREFLECTION
		float retroreflectivity;
	#endif
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0Dielectric;
		vec3 iridescenceF0Metallic;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		return 0.5 / max( gv + gl, EPSILON );
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColorBlended;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transpose( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float rInv = 1.0 / ( roughness + 0.1 );
	float a = -1.9362 + 1.0678 * roughness + 0.4573 * r2 - 0.8469 * rInv;
	float b = -0.6014 + 0.5538 * roughness - 0.4670 * r2 - 0.1255 * rInv;
	float DG = exp( a * dotNV + b );
	return saturate( DG );
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec2 fab, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec2 fab, const in vec3 specularColor, const in float specularF90, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColorBlended * t2.x + ( material.specularF90 - material.specularColorBlended ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseContribution * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
		#ifdef USE_CLEARCOAT
			vec3 Ncc = geometryClearcoatNormal;
			vec2 uvClearcoat = LTC_Uv( Ncc, viewDir, material.clearcoatRoughness );
			vec4 t1Clearcoat = texture2D( ltc_1, uvClearcoat );
			vec4 t2Clearcoat = texture2D( ltc_2, uvClearcoat );
			mat3 mInvClearcoat = mat3(
				vec3( t1Clearcoat.x, 0, t1Clearcoat.y ),
				vec3(             0, 1,             0 ),
				vec3( t1Clearcoat.z, 0, t1Clearcoat.w )
			);
			vec3 fresnelClearcoat = material.clearcoatF0 * t2Clearcoat.x + ( material.clearcoatF90 - material.clearcoatF0 ) * t2Clearcoat.y;
			clearcoatSpecularDirect += lightColor * fresnelClearcoat * LTC_Evaluate( Ncc, viewDir, position, mInvClearcoat, rectCoords );
		#endif
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
 
 		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
 
 		float sheenAlbedoV = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
 		float sheenAlbedoL = IBLSheenBRDF( geometryNormal, directLight.direction, material.sheenRoughness );
 
 		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * max( sheenAlbedoV, sheenAlbedoL );
 
 		irradiance *= sheenEnergyComp;
 
 	#endif
	vec3 specularBRDF = BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	#ifdef USE_RETROREFLECTION
		vec3 retroViewDir = reflect( - geometryViewDir, geometryNormal );
		vec3 retroSpecularBRDF = BRDF_GGX( directLight.direction, retroViewDir, geometryNormal, material );
		specularBRDF = mix( specularBRDF, retroSpecularBRDF, saturate( material.retroreflectivity ) );
	#endif
	reflectedLight.directSpecular += irradiance * specularBRDF * material.multiScatteringCompensation;
	vec3 halfDir = normalize( directLight.direction + geometryViewDir );
	float dotVH = saturate( dot( geometryViewDir, halfDir ) );
	vec3 F = F_Schlick( material.specularColor, material.specularF90, dotVH );
	#ifdef USE_RETROREFLECTION
		vec3 retroHalfDir = normalize( directLight.direction + retroViewDir );
		float dotRetroVH = saturate( dot( retroViewDir, retroHalfDir ) );
		vec3 retroF = F_Schlick( material.specularColor, material.specularF90, dotRetroVH );
		F = mix( F, retroF, saturate( material.retroreflectivity ) );
	#endif
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - F );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( material.dfg, material.specularColor, material.specularF90, material.iridescence, material.iridescenceF0Dielectric, singleScattering, multiScattering );
	#else
		computeMultiscattering( material.dfg, material.specularColor, material.specularF90, singleScattering, multiScattering );
	#endif
	vec3 diffuse = irradiance * BRDF_Lambert( material.diffuseContribution ) * ( 1.0 - singleScattering - multiScattering );
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		sheenSpecularIndirect += irradiance * material.sheenColor * sheenAlbedo * RECIPROCAL_PI;
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		diffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectDiffuse += diffuse;
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness ) * RECIPROCAL_PI;
 	#endif
	vec3 singleScatteringDielectric = vec3( 0.0 );
	vec3 multiScatteringDielectric = vec3( 0.0 );
	vec3 singleScatteringMetallic = vec3( 0.0 );
	vec3 multiScatteringMetallic = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( material.dfg, material.specularColor, material.specularF90, material.iridescence, material.iridescenceF0Dielectric, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscatteringIridescence( material.dfg, material.diffuseColor, material.specularF90, material.iridescence, material.iridescenceF0Metallic, singleScatteringMetallic, multiScatteringMetallic );
	#else
		computeMultiscattering( material.dfg, material.specularColor, material.specularF90, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscattering( material.dfg, material.diffuseColor, material.specularF90, singleScatteringMetallic, multiScatteringMetallic );
	#endif
	vec3 singleScattering = mix( singleScatteringDielectric, singleScatteringMetallic, material.metalness );
	vec3 multiScattering = mix( multiScatteringDielectric, multiScatteringMetallic, material.metalness );
	vec3 totalScatteringDielectric = singleScatteringDielectric + multiScatteringDielectric;
	vec3 diffuse = material.diffuseContribution * ( 1.0 - totalScatteringDielectric );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	vec3 indirectSpecular = radiance * singleScattering;
	indirectSpecular += multiScattering * cosineWeightedIrradiance;
	vec3 indirectDiffuse = diffuse * cosineWeightedIrradiance;
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		indirectSpecular *= sheenEnergyComp;
		indirectDiffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectSpecular += indirectSpecular;
	reflectedLight.indirectDiffuse += indirectDiffuse;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,$p=`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		vec3 iridescenceFresnelDielectric = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		vec3 iridescenceFresnelMetallic = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.diffuseColor );
		material.iridescenceFresnel = mix( iridescenceFresnelDielectric, iridescenceFresnelMetallic, material.metalness );
		material.iridescenceF0Dielectric = Schlick_to_F0( iridescenceFresnelDielectric, 1.0, dotNVi );
		material.iridescenceF0Metallic = Schlick_to_F0( iridescenceFresnelMetallic, 1.0, dotNVi );
	}
#endif
#ifdef STANDARD
	float dotNVms = saturate( dot( geometryNormal, geometryViewDir ) );
	material.dfg = texture2D( dfgLUT, vec2( material.roughness, dotNVms ) ).rg;
	#if ( NUM_SUN_LIGHTS > 0 || NUM_DIR_LIGHTS > 0 || NUM_POINT_LIGHTS > 0 || NUM_SPOT_LIGHTS > 0 )
		float EssMs = material.dfg.x + material.dfg.y;
		material.multiScatteringCompensation = 1.0 + material.specularColorBlended * ( 1.0 / EssMs - 1.0 );
	#endif
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS ) && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SUN_LIGHTS > 0 ) && defined( RE_Direct )
	SunLight sunLight;
	#if defined( USE_SHADOWMAP ) && NUM_SUN_LIGHT_SHADOWS > 0
	SunLightShadow sunLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SUN_LIGHTS; i ++ ) {
		sunLight = sunLights[ i ];
		getSunLightInfo( sunLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SUN_LIGHT_SHADOWS )
		sunLightShadow = sunLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getSunShadow( sunShadowMap[ i ], sunLightShadow, UNROLLED_LOOP_INDEX ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
	#ifdef USE_LIGHT_PROBES_GRID
		vec3 probeWorldPos = ( ( vec4( geometryPosition, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz;
		vec3 probeWorldNormal = transformNormalByInverseViewMatrix( geometryNormal, viewMatrix );
		irradiance += getLightProbeGridIrradiance( probeWorldPos, probeWorldNormal );
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,Kp=`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
		#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG )
			iblIrradiance += getIBLIrradiance( geometryNormal );
		#endif
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		vec3 iblRadiance = getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		vec3 iblRadiance = getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_RETROREFLECTION
		#ifdef USE_ANISOTROPY
			vec3 retroIBLRadiance = getIBLAnisotropyRetroRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
		#else
			vec3 retroIBLRadiance = getIBLRetroRadiance( geometryViewDir, geometryNormal, material.roughness );
		#endif
		iblRadiance = mix( iblRadiance, retroIBLRadiance, saturate( material.retroreflectivity ) );
	#endif
	radiance += iblRadiance;
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,jp=`#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,Jp=`#ifdef USE_LIGHT_PROBES_GRID
uniform highp sampler3D probesSH;
uniform vec3 probesMin;
uniform vec3 probesMax;
uniform vec3 probesResolution;
vec3 getLightProbeGridIrradiance( vec3 worldPos, vec3 worldNormal ) {
	vec3 res = probesResolution;
	vec3 gridRange = probesMax - probesMin;
	vec3 resMinusOne = res - 1.0;
	vec3 probeSpacing = gridRange / resMinusOne;
	vec3 samplePos = worldPos + worldNormal * probeSpacing * 0.5;
	vec3 uvw = clamp( ( samplePos - probesMin ) / gridRange, 0.0, 1.0 );
	uvw = uvw * resMinusOne / res + 0.5 / res;
	float nz          = res.z;
	float paddedSlices = nz + 2.0;
	float atlasDepth  = 7.0 * paddedSlices;
	float uvZBase     = uvw.z * nz + 1.0;
	vec4 s0 = texture( probesSH, vec3( uvw.xy, ( uvZBase                       ) / atlasDepth ) );
	vec4 s1 = texture( probesSH, vec3( uvw.xy, ( uvZBase +       paddedSlices   ) / atlasDepth ) );
	vec4 s2 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 2.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s3 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 3.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s4 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 4.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s5 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 5.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s6 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 6.0 * paddedSlices   ) / atlasDepth ) );
	vec3 c0 = s0.xyz;
	vec3 c1 = vec3( s0.w, s1.xy );
	vec3 c2 = vec3( s1.zw, s2.x );
	vec3 c3 = s2.yzw;
	vec3 c4 = s3.xyz;
	vec3 c5 = vec3( s3.w, s4.xy );
	vec3 c6 = vec3( s4.zw, s5.x );
	vec3 c7 = s5.yzw;
	vec3 c8 = s6.xyz;
	float x = worldNormal.x, y = worldNormal.y, z = worldNormal.z;
	vec3 result = c0 * 0.886227;
	result += c1 * 2.0 * 0.511664 * y;
	result += c2 * 2.0 * 0.511664 * z;
	result += c3 * 2.0 * 0.511664 * x;
	result += c4 * 2.0 * 0.429043 * x * y;
	result += c5 * 2.0 * 0.429043 * y * z;
	result += c6 * ( 0.743125 * z * z - 0.247708 );
	result += c7 * 2.0 * 0.429043 * x * z;
	result += c8 * 0.429043 * ( x * x - y * y );
	return max( result, vec3( 0.0 ) );
}
#endif`,Zp=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,Qp=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,e_=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,t_=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,i_=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,n_=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,s_=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,r_=`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,a_=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,o_=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,l_=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,c_=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,h_=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,u_=`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,d_=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,f_=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#ifdef DOUBLE_SIDED
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#ifdef DOUBLE_SIDED
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,p_=`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#if defined( USE_PACKED_NORMALMAP )
		mapN = vec3( mapN.xy, sqrt( saturate( 1.0 - dot( mapN.xy, mapN.xy ) ) ) );
	#endif
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,__=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,m_=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,g_=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
		#ifdef FLIP_SIDED
			vBitangent = - vBitangent;
		#endif
	#endif
#endif`,x_=`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,y_=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,v_=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,S_=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,M_=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,E_=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,w_=`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	#ifdef USE_REVERSED_DEPTH_BUFFER
	
		return depth * ( far - near ) - far;
	#else
		return depth * ( near - far ) - near;
	#endif
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	
	#ifdef USE_REVERSED_DEPTH_BUFFER
		return ( near * far ) / ( ( near - far ) * depth - near );
	#else
		return ( near * far ) / ( ( far - near ) * depth - far );
	#endif
}`,T_=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,b_=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,A_=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,C_=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,R_=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,P_=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,I_=`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
		#define SUN_LIGHT_CASCADES 2
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow sunShadowMap[ NUM_SUN_LIGHT_SHADOWS ];
		#else
			uniform sampler2D sunShadowMap[ NUM_SUN_LIGHT_SHADOWS ];
		#endif
		uniform mat4 sunShadowMatrix[ NUM_SUN_LIGHT_SHADOWS * SUN_LIGHT_CASCADES ];
		uniform vec4 sunShadowCascade[ NUM_SUN_LIGHT_SHADOWS * SUN_LIGHT_CASCADES ];
		varying vec4 vSunShadowWorldPosition;
		varying vec3 vSunShadowWorldNormal;
		struct SunLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SunLightShadow sunLightShadows[ NUM_SUN_LIGHT_SHADOWS ];
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#else
			uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#endif
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#else
			uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#endif
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform samplerCubeShadow pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#elif defined( SHADOWMAP_TYPE_BASIC )
			uniform samplerCube pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#endif
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float interleavedGradientNoise( vec2 position ) {
			return fract( 52.9829189 * fract( dot( position, vec2( 0.06711056, 0.00583715 ) ) ) );
		}
		vec2 vogelDiskSample( int sampleIndex, int samplesCount, float phi ) {
			const float goldenAngle = 2.399963229728653;
			float r = sqrt( ( float( sampleIndex ) + 0.5 ) / float( samplesCount ) );
			float theta = float( sampleIndex ) * goldenAngle + phi;
			return vec2( cos( theta ), sin( theta ) ) * r;
		}
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			shadowCoord.z += shadowBias;
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
				float radius = shadowRadius * texelSize.x;
				float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
				shadow = (
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 0, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 1, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 2, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 3, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 4, 5, phi ) * radius, shadowCoord.z ) )
				) * 0.2;
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#elif defined( SHADOWMAP_TYPE_VSM )
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 distribution = texture2D( shadowMap, shadowCoord.xy ).rg;
				float mean = distribution.x;
				float variance = distribution.y * distribution.y;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					float hard_shadow = step( mean, shadowCoord.z );
				#else
					float hard_shadow = step( shadowCoord.z, mean );
				#endif
				
				if ( hard_shadow == 1.0 ) {
					shadow = 1.0;
				} else {
					variance = max( variance, 0.0000001 );
					float d = shadowCoord.z - mean;
					float p_max = variance / ( variance + d * d );
					p_max = clamp( ( p_max - 0.3 ) / 0.65, 0.0, 1.0 );
					shadow = max( hard_shadow, p_max );
				}
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#else
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				float depth = texture2D( shadowMap, shadowCoord.xy ).r;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					shadow = step( depth, shadowCoord.z );
				#else
					shadow = step( shadowCoord.z, depth );
				#endif
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#endif
	#if NUM_SUN_LIGHT_SHADOWS > 0
		float getSunShadow(
			#if defined( SHADOWMAP_TYPE_PCF )
				sampler2DShadow shadowMap,
			#else
				sampler2D shadowMap,
			#endif
			SunLightShadow sunLightShadow,
			int shadowIndex
		) {
			vec4 shadowWorldPosition = vec4( vSunShadowWorldPosition.xyz + vSunShadowWorldNormal * sunLightShadow.shadowNormalBias, 1.0 );
			float viewDepth = vSunShadowWorldPosition.w;
			int cascadeOffset = shadowIndex * SUN_LIGHT_CASCADES;
			float shadow = 1.0;
			for ( int i = SUN_LIGHT_CASCADES - 1; i >= 0; i -- ) {
				vec4 cascade = sunShadowCascade[ cascadeOffset + i ];
				if ( viewDepth >= cascade.x && viewDepth < cascade.y ) {
					float cascadeShadow = getShadow(
						shadowMap,
						sunLightShadow.shadowMapSize,
						sunLightShadow.shadowIntensity,
						sunLightShadow.shadowBias,
						sunLightShadow.shadowRadius,
						sunShadowMatrix[ cascadeOffset + i ] * shadowWorldPosition
					);
					shadow = mix( cascadeShadow, shadow, smoothstep( cascade.z, cascade.y, viewDepth ) );
				}
			}
			return shadow;
		}
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	#if defined( SHADOWMAP_TYPE_PCF )
	float getPointShadow( samplerCubeShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 bd3D = normalize( lightToPosition );
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			#ifdef USE_REVERSED_DEPTH_BUFFER
				float dp = ( shadowCameraNear * ( shadowCameraFar - viewSpaceZ ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp -= shadowBias;
			#else
				float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp += shadowBias;
			#endif
			float texelSize = shadowRadius / shadowMapSize.x;
			vec3 absDir = abs( bd3D );
			vec3 tangent = absDir.x > absDir.z ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
			tangent = normalize( cross( bd3D, tangent ) );
			vec3 bitangent = cross( bd3D, tangent );
			float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
			vec2 sample0 = vogelDiskSample( 0, 5, phi );
			vec2 sample1 = vogelDiskSample( 1, 5, phi );
			vec2 sample2 = vogelDiskSample( 2, 5, phi );
			vec2 sample3 = vogelDiskSample( 3, 5, phi );
			vec2 sample4 = vogelDiskSample( 4, 5, phi );
			shadow = (
				texture( shadowMap, vec4( bd3D + ( tangent * sample0.x + bitangent * sample0.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample1.x + bitangent * sample1.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample2.x + bitangent * sample2.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample3.x + bitangent * sample3.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample4.x + bitangent * sample4.y ) * texelSize, dp ) )
			) * 0.2;
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#elif defined( SHADOWMAP_TYPE_BASIC )
	float getPointShadow( samplerCube shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			float depth = textureCube( shadowMap, bd3D ).r;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				depth = 1.0 - depth;
			#endif
			shadow = step( dp, depth );
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#endif
	#endif
#endif`,D_=`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
		varying vec4 vSunShadowWorldPosition;
		varying vec3 vSunShadowWorldNormal;
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,L_=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_SUN_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	#ifdef HAS_NORMAL
		vec3 shadowWorldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
	#else
		vec3 shadowWorldNormal = vec3( 0.0 );
	#endif
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_SUN_LIGHT_SHADOWS > 0
		vSunShadowWorldPosition = vec4( worldPosition.xyz, - mvPosition.z );
		vSunShadowWorldNormal = shadowWorldNormal;
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,N_=`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_SUN_LIGHT_SHADOWS > 0
	SunLightShadow sunLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SUN_LIGHT_SHADOWS; i ++ ) {
		sunLight = sunLightShadows[ i ];
		shadow *= receiveShadow ? getSunShadow( sunShadowMap[ i ], sunLight, UNROLLED_LOOP_INDEX ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0 && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,F_=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,O_=`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,U_=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,k_=`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,B_=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,H_=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,G_=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,z_=`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,W_=`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseContribution, material.specularColorBlended, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,V_=`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		#else
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,X_=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,q_=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,Y_=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,$_=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`;const K_=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,j_=`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,J_=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,Z_=`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vWorldDirection );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,Q_=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,em=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,tm=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,im=`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	#ifdef USE_REVERSED_DEPTH_BUFFER
		float fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];
	#else
		float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;
	#endif
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,nm=`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,sm=`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = vec4( dist, 0.0, 0.0, 1.0 );
}`,rm=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,am=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,om=`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,lm=`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,cm=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,hm=`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,um=`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,dm=`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,fm=`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,pm=`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,_m=`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,mm=`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( normalize( normal ) * 0.5 + 0.5, diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,gm=`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,xm=`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,ym=`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,vm=`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_RETROREFLECTION
	uniform float retroreflectivity;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
 
		outgoingLight = outgoingLight + sheenSpecularDirect + sheenSpecularIndirect;
 
 	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Sm=`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Mm=`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Em=`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,wm=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,Tm=`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,bm=`uniform vec3 color;
uniform float opacity;
#include <common>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,Am=`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,Cm=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,Ne={alphahash_fragment:Kf,alphahash_pars_fragment:jf,alphamap_fragment:Jf,alphamap_pars_fragment:Zf,alphatest_fragment:Qf,alphatest_pars_fragment:ep,aomap_fragment:tp,aomap_pars_fragment:ip,batching_pars_vertex:np,batching_vertex:sp,begin_vertex:rp,beginnormal_vertex:ap,bsdfs:op,iridescence_fragment:lp,bumpmap_pars_fragment:cp,clipping_planes_fragment:hp,clipping_planes_pars_fragment:up,clipping_planes_pars_vertex:dp,clipping_planes_vertex:fp,color_fragment:pp,color_pars_fragment:_p,color_pars_vertex:mp,color_vertex:gp,common:xp,cube_uv_reflection_fragment:yp,defaultnormal_vertex:vp,displacementmap_pars_vertex:Sp,displacementmap_vertex:Mp,emissivemap_fragment:Ep,emissivemap_pars_fragment:wp,colorspace_fragment:Tp,colorspace_pars_fragment:bp,envmap_fragment:Ap,envmap_common_pars_fragment:Cp,envmap_pars_fragment:Rp,envmap_pars_vertex:Pp,envmap_physical_pars_fragment:Gp,envmap_vertex:Ip,fog_vertex:Dp,fog_pars_vertex:Lp,fog_fragment:Np,fog_pars_fragment:Fp,gradientmap_pars_fragment:Op,lightmap_pars_fragment:Up,lights_lambert_fragment:kp,lights_lambert_pars_fragment:Bp,lights_pars_begin:Hp,lights_toon_fragment:zp,lights_toon_pars_fragment:Wp,lights_phong_fragment:Vp,lights_phong_pars_fragment:Xp,lights_physical_fragment:qp,lights_physical_pars_fragment:Yp,lights_fragment_begin:$p,lights_fragment_maps:Kp,lights_fragment_end:jp,lightprobes_pars_fragment:Jp,logdepthbuf_fragment:Zp,logdepthbuf_pars_fragment:Qp,logdepthbuf_pars_vertex:e_,logdepthbuf_vertex:t_,map_fragment:i_,map_pars_fragment:n_,map_particle_fragment:s_,map_particle_pars_fragment:r_,metalnessmap_fragment:a_,metalnessmap_pars_fragment:o_,morphinstance_vertex:l_,morphcolor_vertex:c_,morphnormal_vertex:h_,morphtarget_pars_vertex:u_,morphtarget_vertex:d_,normal_fragment_begin:f_,normal_fragment_maps:p_,normal_pars_fragment:__,normal_pars_vertex:m_,normal_vertex:g_,normalmap_pars_fragment:x_,clearcoat_normal_fragment_begin:y_,clearcoat_normal_fragment_maps:v_,clearcoat_pars_fragment:S_,iridescence_pars_fragment:M_,opaque_fragment:E_,packing:w_,premultiplied_alpha_fragment:T_,project_vertex:b_,dithering_fragment:A_,dithering_pars_fragment:C_,roughnessmap_fragment:R_,roughnessmap_pars_fragment:P_,shadowmap_pars_fragment:I_,shadowmap_pars_vertex:D_,shadowmap_vertex:L_,shadowmask_pars_fragment:N_,skinbase_vertex:F_,skinning_pars_vertex:O_,skinning_vertex:U_,skinnormal_vertex:k_,specularmap_fragment:B_,specularmap_pars_fragment:H_,tonemapping_fragment:G_,tonemapping_pars_fragment:z_,transmission_fragment:W_,transmission_pars_fragment:V_,uv_pars_fragment:X_,uv_pars_vertex:q_,uv_vertex:Y_,worldpos_vertex:$_,background_vert:K_,background_frag:j_,backgroundCube_vert:J_,backgroundCube_frag:Z_,cube_vert:Q_,cube_frag:em,depth_vert:tm,depth_frag:im,distance_vert:nm,distance_frag:sm,equirect_vert:rm,equirect_frag:am,linedashed_vert:om,linedashed_frag:lm,meshbasic_vert:cm,meshbasic_frag:hm,meshlambert_vert:um,meshlambert_frag:dm,meshmatcap_vert:fm,meshmatcap_frag:pm,meshnormal_vert:_m,meshnormal_frag:mm,meshphong_vert:gm,meshphong_frag:xm,meshphysical_vert:ym,meshphysical_frag:vm,meshtoon_vert:Sm,meshtoon_frag:Mm,points_vert:Em,points_frag:wm,shadow_vert:Tm,shadow_frag:bm,sprite_vert:Am,sprite_frag:Cm},ue={common:{diffuse:{value:new Xe(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new Ie},alphaMap:{value:null},alphaMapTransform:{value:new Ie},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new Ie}},envmap:{envMap:{value:null},envMapRotation:{value:new Ie},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new Ie}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new Ie}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new Ie},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new Ie},normalScale:{value:new Ge(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new Ie},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new Ie}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new Ie}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new Ie}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new Xe(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},sunLights:{value:[],properties:{direction:{},color:{}}},sunLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},sunShadowMatrix:{value:[]},sunShadowCascade:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null},probesSH:{value:null},probesMin:{value:new z},probesMax:{value:new z},probesResolution:{value:new z}},points:{diffuse:{value:new Xe(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new Ie},alphaTest:{value:0},uvTransform:{value:new Ie}},sprite:{diffuse:{value:new Xe(16777215)},opacity:{value:1},center:{value:new Ge(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new Ie},alphaMap:{value:null},alphaMapTransform:{value:new Ie},alphaTest:{value:0}}},Ii={basic:{uniforms:Ht([ue.common,ue.specularmap,ue.envmap,ue.aomap,ue.lightmap,ue.fog]),vertexShader:Ne.meshbasic_vert,fragmentShader:Ne.meshbasic_frag},lambert:{uniforms:Ht([ue.common,ue.specularmap,ue.envmap,ue.aomap,ue.lightmap,ue.emissivemap,ue.bumpmap,ue.normalmap,ue.displacementmap,ue.fog,ue.lights,{emissive:{value:new Xe(0)},envMapIntensity:{value:1}}]),vertexShader:Ne.meshlambert_vert,fragmentShader:Ne.meshlambert_frag},phong:{uniforms:Ht([ue.common,ue.specularmap,ue.envmap,ue.aomap,ue.lightmap,ue.emissivemap,ue.bumpmap,ue.normalmap,ue.displacementmap,ue.fog,ue.lights,{emissive:{value:new Xe(0)},specular:{value:new Xe(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:Ne.meshphong_vert,fragmentShader:Ne.meshphong_frag},standard:{uniforms:Ht([ue.common,ue.envmap,ue.aomap,ue.lightmap,ue.emissivemap,ue.bumpmap,ue.normalmap,ue.displacementmap,ue.roughnessmap,ue.metalnessmap,ue.fog,ue.lights,{emissive:{value:new Xe(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:Ne.meshphysical_vert,fragmentShader:Ne.meshphysical_frag},toon:{uniforms:Ht([ue.common,ue.aomap,ue.lightmap,ue.emissivemap,ue.bumpmap,ue.normalmap,ue.displacementmap,ue.gradientmap,ue.fog,ue.lights,{emissive:{value:new Xe(0)}}]),vertexShader:Ne.meshtoon_vert,fragmentShader:Ne.meshtoon_frag},matcap:{uniforms:Ht([ue.common,ue.bumpmap,ue.normalmap,ue.displacementmap,ue.fog,{matcap:{value:null}}]),vertexShader:Ne.meshmatcap_vert,fragmentShader:Ne.meshmatcap_frag},points:{uniforms:Ht([ue.points,ue.fog]),vertexShader:Ne.points_vert,fragmentShader:Ne.points_frag},dashed:{uniforms:Ht([ue.common,ue.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:Ne.linedashed_vert,fragmentShader:Ne.linedashed_frag},depth:{uniforms:Ht([ue.common,ue.displacementmap]),vertexShader:Ne.depth_vert,fragmentShader:Ne.depth_frag},normal:{uniforms:Ht([ue.common,ue.bumpmap,ue.normalmap,ue.displacementmap,{opacity:{value:1}}]),vertexShader:Ne.meshnormal_vert,fragmentShader:Ne.meshnormal_frag},sprite:{uniforms:Ht([ue.sprite,ue.fog]),vertexShader:Ne.sprite_vert,fragmentShader:Ne.sprite_frag},background:{uniforms:{uvTransform:{value:new Ie},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:Ne.background_vert,fragmentShader:Ne.background_frag},backgroundCube:{uniforms:{envMap:{value:null},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new Ie}},vertexShader:Ne.backgroundCube_vert,fragmentShader:Ne.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:Ne.cube_vert,fragmentShader:Ne.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:Ne.equirect_vert,fragmentShader:Ne.equirect_frag},distance:{uniforms:Ht([ue.common,ue.displacementmap,{referencePosition:{value:new z},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:Ne.distance_vert,fragmentShader:Ne.distance_frag},shadow:{uniforms:Ht([ue.lights,ue.fog,{color:{value:new Xe(0)},opacity:{value:1}}]),vertexShader:Ne.shadow_vert,fragmentShader:Ne.shadow_frag}};Ii.physical={uniforms:Ht([Ii.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new Ie},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new Ie},clearcoatNormalScale:{value:new Ge(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new Ie},dispersion:{value:0},retroreflectivity:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new Ie},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new Ie},sheen:{value:0},sheenColor:{value:new Xe(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new Ie},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new Ie},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new Ie},transmissionSamplerSize:{value:new Ge},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new Ie},attenuationDistance:{value:0},attenuationColor:{value:new Xe(0)},specularColor:{value:new Xe(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new Ie},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new Ie},anisotropyVector:{value:new Ge},anisotropyMap:{value:null},anisotropyMapTransform:{value:new Ie}}]),vertexShader:Ne.meshphysical_vert,fragmentShader:Ne.meshphysical_frag};const ur={r:0,b:0,g:0},Rm=new wt,Vu=new Ie;Vu.set(-1,0,0,0,1,0,0,0,1);function Pm(r,e,t,i,n,s){const a=new Xe(0);let o=n===!0?0:1,l,c,h=null,d=0,u=null;function f(T){let A=T.isScene===!0?T.background:null;if(A&&A.isTexture){const S=T.backgroundBlurriness>0;A=e.get(A,S)}return A}function m(T){let A=!1;const S=f(T);S===null?p(a,o):S&&S.isColor&&(p(S,1),A=!0);const M=r.xr.getEnvironmentBlendMode();M==="additive"?t.buffers.color.setClear(0,0,0,1,s):M==="alpha-blend"&&t.buffers.color.setClear(0,0,0,0,s),(r.autoClear||A)&&(t.buffers.depth.setTest(!0),t.buffers.depth.setMask(!0),t.buffers.color.setMask(!0),r.clear(r.autoClearColor,r.autoClearDepth,r.autoClearStencil))}function y(T,A){const S=f(A);S&&(S.isCubeTexture||S.mapping===jr)?(c===void 0&&(c=new Ui(new ks(1,1,1),new Si({name:"BackgroundCubeMaterial",uniforms:rs(Ii.backgroundCube.uniforms),vertexShader:Ii.backgroundCube.vertexShader,fragmentShader:Ii.backgroundCube.fragmentShader,side:qt,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),c.geometry.deleteAttribute("normal"),c.geometry.deleteAttribute("uv"),c.onBeforeRender=function(M,E,C){this.matrixWorld.copyPosition(C.matrixWorld)},Object.defineProperty(c.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),i.update(c)),c.material.uniforms.envMap.value=S,c.material.uniforms.backgroundBlurriness.value=A.backgroundBlurriness,c.material.uniforms.backgroundIntensity.value=A.backgroundIntensity,c.material.uniforms.backgroundRotation.value.setFromMatrix4(Rm.makeRotationFromEuler(A.backgroundRotation)).transpose(),S.isCubeTexture&&S.isRenderTargetTexture===!1&&c.material.uniforms.backgroundRotation.value.premultiply(Vu),c.material.toneMapped=We.getTransfer(S.colorSpace)!==nt,(h!==S||d!==S.version||u!==r.toneMapping)&&(c.material.needsUpdate=!0,h=S,d=S.version,u=r.toneMapping),c.layers.enableAll(),T.unshift(c,c.geometry,c.material,0,0,null)):S&&S.isTexture&&(l===void 0&&(l=new Ui(new Bs(2,2),new Si({name:"BackgroundMaterial",uniforms:rs(Ii.background.uniforms),vertexShader:Ii.background.vertexShader,fragmentShader:Ii.background.fragmentShader,side:Cn,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),l.geometry.deleteAttribute("normal"),Object.defineProperty(l.material,"map",{get:function(){return this.uniforms.t2D.value}}),i.update(l)),l.material.uniforms.t2D.value=S,l.material.uniforms.backgroundIntensity.value=A.backgroundIntensity,l.material.toneMapped=We.getTransfer(S.colorSpace)!==nt,S.matrixAutoUpdate===!0&&S.updateMatrix(),l.material.uniforms.uvTransform.value.copy(S.matrix),(h!==S||d!==S.version||u!==r.toneMapping)&&(l.material.needsUpdate=!0,h=S,d=S.version,u=r.toneMapping),l.layers.enableAll(),T.unshift(l,l.geometry,l.material,0,0,null))}function p(T,A){T.getRGB(ur,Gu(r)),t.buffers.color.setClear(ur.r,ur.g,ur.b,A,s)}function _(){c!==void 0&&(c.geometry.dispose(),c.material.dispose(),c=void 0),l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0)}return{getClearColor:function(){return a},setClearColor:function(T,A=1){a.set(T),o=A,p(a,o)},getClearAlpha:function(){return o},setClearAlpha:function(T){o=T,p(a,o)},render:m,addToRenderList:y,dispose:_}}function Im(r,e){const t=r.getParameter(r.MAX_VERTEX_ATTRIBS),i={},n=u(null);let s=n,a=!1;function o(P,O,B,N,H){let J=!1;const V=d(P,N,B,O);s!==V&&(s=V,c(s.object)),J=f(P,N,B,H),J&&m(P,N,B,H),H!==null&&e.update(H,r.ELEMENT_ARRAY_BUFFER),(J||a)&&(a=!1,S(P,O,B,N),H!==null&&r.bindBuffer(r.ELEMENT_ARRAY_BUFFER,e.get(H).buffer))}function l(){return r.createVertexArray()}function c(P){return r.bindVertexArray(P)}function h(P){return r.deleteVertexArray(P)}function d(P,O,B,N){const H=N.wireframe===!0;let J=i[O.id];J===void 0&&(J={},i[O.id]=J);const V=P.isInstancedMesh===!0?P.id:0;let ne=J[V];ne===void 0&&(ne={},J[V]=ne);let q=ne[B.id];q===void 0&&(q={},ne[B.id]=q);let ee=q[H];return ee===void 0&&(ee=u(l()),q[H]=ee),ee}function u(P){const O=[],B=[],N=[];for(let H=0;H<t;H++)O[H]=0,B[H]=0,N[H]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:O,enabledAttributes:B,attributeDivisors:N,object:P,attributes:{},index:null}}function f(P,O,B,N){const H=s.attributes,J=O.attributes;let V=0;const ne=B.getAttributes();for(const q in ne)if(ne[q].location>=0){const ie=H[q];let Ae=J[q];if(Ae===void 0&&(q==="instanceMatrix"&&P.instanceMatrix&&(Ae=P.instanceMatrix),q==="instanceColor"&&P.instanceColor&&(Ae=P.instanceColor)),ie===void 0||ie.attribute!==Ae||Ae&&ie.data!==Ae.data)return!0;V++}return s.attributesNum!==V||s.index!==N}function m(P,O,B,N){const H={},J=O.attributes;let V=0;const ne=B.getAttributes();for(const q in ne)if(ne[q].location>=0){let ie=J[q];ie===void 0&&(q==="instanceMatrix"&&P.instanceMatrix&&(ie=P.instanceMatrix),q==="instanceColor"&&P.instanceColor&&(ie=P.instanceColor));const Ae={};Ae.attribute=ie,ie&&ie.data&&(Ae.data=ie.data),H[q]=Ae,V++}s.attributes=H,s.attributesNum=V,s.index=N}function y(){const P=s.newAttributes;for(let O=0,B=P.length;O<B;O++)P[O]=0}function p(P){_(P,0)}function _(P,O){const B=s.newAttributes,N=s.enabledAttributes,H=s.attributeDivisors;B[P]=1,N[P]===0&&(r.enableVertexAttribArray(P),N[P]=1),H[P]!==O&&(r.vertexAttribDivisor(P,O),H[P]=O)}function T(){const P=s.newAttributes,O=s.enabledAttributes;for(let B=0,N=O.length;B<N;B++)O[B]!==P[B]&&(r.disableVertexAttribArray(B),O[B]=0)}function A(P,O,B,N,H,J,V){V===!0?r.vertexAttribIPointer(P,O,B,H,J):r.vertexAttribPointer(P,O,B,N,H,J)}function S(P,O,B,N){y();const H=N.attributes,J=B.getAttributes(),V=O.defaultAttributeValues;for(const ne in J){const q=J[ne];if(q.location>=0){let ee=H[ne];if(ee===void 0&&(ne==="instanceMatrix"&&P.instanceMatrix&&(ee=P.instanceMatrix),ne==="instanceColor"&&P.instanceColor&&(ee=P.instanceColor)),ee!==void 0){const ie=ee.normalized,Ae=ee.itemSize,Te=e.get(ee);if(Te===void 0)continue;const lt=Te.buffer,qe=Te.type,je=Te.bytesPerElement,Y=qe===r.INT||qe===r.UNSIGNED_INT||ee.gpuType===jo;if(ee.isInterleavedBufferAttribute){const Q=ee.data,xe=Q.stride,Pe=ee.offset;if(Q.isInstancedInterleavedBuffer){for(let me=0;me<q.locationSize;me++)_(q.location+me,Q.meshPerAttribute);P.isInstancedMesh!==!0&&N._maxInstanceCount===void 0&&(N._maxInstanceCount=Q.meshPerAttribute*Q.count)}else for(let me=0;me<q.locationSize;me++)p(q.location+me);r.bindBuffer(r.ARRAY_BUFFER,lt);for(let me=0;me<q.locationSize;me++)A(q.location+me,Ae/q.locationSize,qe,ie,xe*je,(Pe+Ae/q.locationSize*me)*je,Y)}else{if(ee.isInstancedBufferAttribute){for(let Q=0;Q<q.locationSize;Q++)_(q.location+Q,ee.meshPerAttribute);P.isInstancedMesh!==!0&&N._maxInstanceCount===void 0&&(N._maxInstanceCount=ee.meshPerAttribute*ee.count)}else for(let Q=0;Q<q.locationSize;Q++)p(q.location+Q);r.bindBuffer(r.ARRAY_BUFFER,lt);for(let Q=0;Q<q.locationSize;Q++)A(q.location+Q,Ae/q.locationSize,qe,ie,Ae*je,Ae/q.locationSize*Q*je,Y)}}else if(V!==void 0){const ie=V[ne];if(ie!==void 0)switch(ie.length){case 2:r.vertexAttrib2fv(q.location,ie);break;case 3:r.vertexAttrib3fv(q.location,ie);break;case 4:r.vertexAttrib4fv(q.location,ie);break;default:r.vertexAttrib1fv(q.location,ie)}}}}T()}function M(){w();for(const P in i){const O=i[P];for(const B in O){const N=O[B];for(const H in N){const J=N[H];for(const V in J)h(J[V].object),delete J[V];delete N[H]}}delete i[P]}}function E(P){if(i[P.id]===void 0)return;const O=i[P.id];for(const B in O){const N=O[B];for(const H in N){const J=N[H];for(const V in J)h(J[V].object),delete J[V];delete N[H]}}delete i[P.id]}function C(P){for(const O in i){const B=i[O];for(const N in B){const H=B[N];if(H[P.id]===void 0)continue;const J=H[P.id];for(const V in J)h(J[V].object),delete J[V];delete H[P.id]}}}function g(P){for(const O in i){const B=i[O],N=P.isInstancedMesh===!0?P.id:0,H=B[N];if(H!==void 0){for(const J in H){const V=H[J];for(const ne in V)h(V[ne].object),delete V[ne];delete H[J]}delete B[N],Object.keys(B).length===0&&delete i[O]}}}function w(){R(),a=!0,s!==n&&(s=n,c(s.object))}function R(){n.geometry=null,n.program=null,n.wireframe=!1}return{setup:o,reset:w,resetDefaultState:R,dispose:M,releaseStatesOfGeometry:E,releaseStatesOfObject:g,releaseStatesOfProgram:C,initAttributes:y,enableAttribute:p,disableUnusedAttributes:T}}function Dm(r,e,t){let i;function n(l){i=l}function s(l,c){r.drawArrays(i,l,c),t.update(c,i,1)}function a(l,c,h){h!==0&&(r.drawArraysInstanced(i,l,c,h),t.update(c,i,h))}function o(l,c,h){if(h===0)return;e.get("WEBGL_multi_draw").multiDrawArraysWEBGL(i,l,0,c,0,h);let u=0;for(let f=0;f<h;f++)u+=c[f];t.update(u,i,1)}this.setMode=n,this.render=s,this.renderInstances=a,this.renderMultiDraw=o}function Lm(r,e,t,i){let n;function s(){if(n!==void 0)return n;if(e.has("EXT_texture_filter_anisotropic")===!0){const C=e.get("EXT_texture_filter_anisotropic");n=r.getParameter(C.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else n=0;return n}function a(C){return!(C!==ci&&i.convert(C)!==r.getParameter(r.IMPLEMENTATION_COLOR_READ_FORMAT))}function o(C){const g=C===Oi&&(e.has("EXT_color_buffer_half_float")||e.has("EXT_color_buffer_float"));return!(C!==ti&&C!==Di&&!g&&i.convert(C)!==r.getParameter(r.IMPLEMENTATION_COLOR_READ_TYPE))}function l(C){if(C==="highp"){if(r.getShaderPrecisionFormat(r.VERTEX_SHADER,r.HIGH_FLOAT).precision>0&&r.getShaderPrecisionFormat(r.FRAGMENT_SHADER,r.HIGH_FLOAT).precision>0)return"highp";C="mediump"}return C==="mediump"&&r.getShaderPrecisionFormat(r.VERTEX_SHADER,r.MEDIUM_FLOAT).precision>0&&r.getShaderPrecisionFormat(r.FRAGMENT_SHADER,r.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let c=t.precision!==void 0?t.precision:"highp";const h=l(c);h!==c&&(Re("WebGLRenderer:",c,"not supported, using",h,"instead."),c=h);const d=t.logarithmicDepthBuffer===!0,u=t.reversedDepthBuffer===!0&&e.has("EXT_clip_control");t.reversedDepthBuffer===!0&&u===!1&&Re("WebGLRenderer: Unable to use reversed depth buffer due to missing EXT_clip_control extension. Fallback to default depth buffer.");const f=r.getParameter(r.MAX_TEXTURE_IMAGE_UNITS),m=r.getParameter(r.MAX_VERTEX_TEXTURE_IMAGE_UNITS),y=r.getParameter(r.MAX_TEXTURE_SIZE),p=r.getParameter(r.MAX_CUBE_MAP_TEXTURE_SIZE),_=r.getParameter(r.MAX_VERTEX_ATTRIBS),T=r.getParameter(r.MAX_VERTEX_UNIFORM_VECTORS),A=r.getParameter(r.MAX_VARYING_VECTORS),S=r.getParameter(r.MAX_FRAGMENT_UNIFORM_VECTORS),M=r.getParameter(r.MAX_SAMPLES),E=r.getParameter(r.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:s,getMaxPrecision:l,textureFormatReadable:a,textureTypeReadable:o,precision:c,logarithmicDepthBuffer:d,reversedDepthBuffer:u,maxTextures:f,maxVertexTextures:m,maxTextureSize:y,maxCubemapSize:p,maxAttributes:_,maxVertexUniforms:T,maxVaryings:A,maxFragmentUniforms:S,maxSamples:M,samples:E}}function Nm(r){const e=this;let t=null,i=0,n=!1,s=!1;const a=new dn,o=new Ie,l={value:null,needsUpdate:!1};this.uniform=l,this.numPlanes=0,this.numIntersection=0,this.init=function(d,u){const f=d.length!==0||u||i!==0||n;return n=u,i=d.length,f},this.beginShadows=function(){s=!0,h(null)},this.endShadows=function(){s=!1},this.setGlobalState=function(d,u){t=h(d,u,0)},this.setState=function(d,u,f){const m=d.clippingPlanes,y=d.clipIntersection,p=d.clipShadows,_=r.get(d);if(!n||m===null||m.length===0||s&&!p)s?h(null):c();else{const T=s?0:i,A=T*4;let S=_.clippingState||null;l.value=S,S=h(m,u,A,f);for(let M=0;M!==A;++M)S[M]=t[M];_.clippingState=S,this.numIntersection=y?this.numPlanes:0,this.numPlanes+=T}};function c(){l.value!==t&&(l.value=t,l.needsUpdate=i>0),e.numPlanes=i,e.numIntersection=0}function h(d,u,f,m){const y=d!==null?d.length:0;let p=null;if(y!==0){if(p=l.value,m!==!0||p===null){const _=f+y*4,T=u.matrixWorldInverse;o.getNormalMatrix(T),(p===null||p.length<_)&&(p=new Float32Array(_));for(let A=0,S=f;A!==y;++A,S+=4)a.copy(d[A]).applyMatrix4(T,o),a.normal.toArray(p,S),p[S+3]=a.constant}l.value=p,l.needsUpdate=!0}return e.numPlanes=y,e.numIntersection=0,p}}const es=4,Fm=6,Om=20,Um=256,fs=new al,cc=new Xe;let Na=null,Fa=0,Oa=0,Ua=!1;const km=new z,Sn=new z;class hc{constructor(e){this._renderer=e,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._sizeLods=[],this._lodMeshes=[],this._backgroundBox=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null}fromScene(e,t=0,i=.1,n=100,s={}){const{size:a=256,position:o=km}=s;Na=this._renderer.getRenderTarget(),Fa=this._renderer.getActiveCubeFace(),Oa=this._renderer.getActiveMipmapLevel(),Ua=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(a);const l=this._allocateTargets();return l.depthBuffer=!0,this._sceneToCubeUV(e,i,n,l,o),t>0&&this._blur(l,0,0,t),this._applyPMREM(l),this._cleanup(l),l}fromEquirectangular(e,t=null){return this._fromTexture(e,t)}fromCubemap(e,t=null){return this._fromTexture(e,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=fc(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=dc(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose(),this._backgroundBox!==null&&(this._backgroundBox.geometry.dispose(),this._backgroundBox.material.dispose())}_setSize(e){this._lodMax=Math.floor(Math.log2(e)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._ggxMaterial!==null&&this._ggxMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let e=0;e<this._lodMeshes.length;e++)this._lodMeshes[e].geometry.dispose()}_cleanup(e){this._renderer.setRenderTarget(Na,Fa,Oa),this._renderer.xr.enabled=Ua,e.scissorTest=!1,Yn(e,0,0,e.width,e.height)}_fromTexture(e,t){e.mapping===Rn||e.mapping===ss?this._setSize(e.image.length===0?16:e.image[0].width||e.image[0].image.width):this._setSize(e.image.width/4),Na=this._renderer.getRenderTarget(),Fa=this._renderer.getActiveCubeFace(),Oa=this._renderer.getActiveMipmapLevel(),Ua=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;const i=t||this._allocateTargets();return this._textureToCubeUV(e,i),this._applyPMREM(i),this._cleanup(i),i}_allocateTargets(){const e=3*Math.max(this._cubeSize,112),t=4*this._cubeSize,i={magFilter:Dt,minFilter:Dt,generateMipmaps:!1,type:Oi,format:ci,colorSpace:Hr,depthBuffer:!1},n=uc(e,t,i);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==e||this._pingPongRenderTarget.height!==t){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=uc(e,t,i);const{_lodMax:s}=this;({lodMeshes:this._lodMeshes,sizeLods:this._sizeLods}=Bm(s)),this._blurMaterial=Gm(s,e,t),this._ggxMaterial=Hm(s,e,t)}return n}_compileMaterial(e){const t=new Ui(new en,e);this._renderer.compile(t,fs)}_sceneToCubeUV(e,t,i,n,s){const l=new mi(90,1,t,i),c=[1,-1,1,1,1,1],h=[1,1,1,-1,-1,-1],d=this._renderer,u=d.autoClear,f=d.toneMapping;d.getClearColor(cc),d.toneMapping=Ni,d.autoClear=!1,d.state.buffers.depth.getReversed()&&(d.setRenderTarget(n),d.clearDepth(),d.setRenderTarget(null)),this._backgroundBox===null&&(this._backgroundBox=new Ui(new ks,new Ou({name:"PMREM.Background",side:qt,depthWrite:!1,depthTest:!1})));const y=this._backgroundBox,p=y.material;let _=!1;const T=e.background;T?T.isColor&&(p.color.copy(T),e.background=null,_=!0):(p.color.copy(cc),_=!0);for(let A=0;A<6;A++){const S=A%3;S===0?(l.up.set(0,c[A],0),l.position.set(s.x,s.y,s.z),l.lookAt(s.x+h[A],s.y,s.z)):S===1?(l.up.set(0,0,c[A]),l.position.set(s.x,s.y,s.z),l.lookAt(s.x,s.y+h[A],s.z)):(l.up.set(0,c[A],0),l.position.set(s.x,s.y,s.z),l.lookAt(s.x,s.y,s.z+h[A]));const M=this._cubeSize;Yn(n,S*M,A>2?M:0,M,M),d.setRenderTarget(n),_&&d.render(y,l),d.render(e,l)}d.toneMapping=f,d.autoClear=u,e.background=T}_textureToCubeUV(e,t){const i=this._renderer,n=e.mapping===Rn||e.mapping===ss;n?(this._cubemapMaterial===null&&(this._cubemapMaterial=fc()),this._cubemapMaterial.uniforms.flipEnvMap.value=e.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=dc());const s=n?this._cubemapMaterial:this._equirectMaterial,a=this._lodMeshes[0];a.material=s;const o=s.uniforms;o.envMap.value=e;const l=this._cubeSize;Yn(t,0,0,3*l,2*l),i.setRenderTarget(t),i.render(a,fs)}_applyPMREM(e){const t=this._renderer,i=t.autoClear;t.autoClear=!1;const n=this._lodMeshes.length;for(let s=1;s<n;s++)this._applyGGXFilter(e,s-1,s);t.autoClear=i}_applyGGXFilter(e,t,i){const n=this._renderer,s=this._pingPongRenderTarget,a=this._ggxMaterial,o=this._lodMeshes[i];o.material=a;const l=a.uniforms,c=i/(this._lodMeshes.length-1),h=t/(this._lodMeshes.length-1),d=Math.sqrt(c*c-h*h),u=c*1.25,f=d*u,{_lodMax:m}=this,y=this._sizeLods[i],p=3*y*(i>m-es?i-m+es:0),_=4*(this._cubeSize-y);l.envMap.value=e.texture,l.roughness.value=f,l.mipInt.value=m-t,Yn(s,p,_,3*y,2*y),n.setRenderTarget(s),n.render(o,fs),l.envMap.value=s.texture,l.roughness.value=0,l.mipInt.value=m-i,Yn(e,p,_,3*y,2*y),n.setRenderTarget(e),n.render(o,fs)}_blur(e,t,i,n){const s=this._pingPongRenderTarget,a=Math.min(n,Math.PI)/Math.SQRT2;this._blurPass(e,s,t,i,a),this._blurPass(s,e,i,i,a)}_blurPass(e,t,i,n,s){const a=this._renderer,o=this._blurMaterial,l=this._lodMeshes[n];l.material=o;const c=o.uniforms;c.envMap.value=e.texture,c.sigma.value=s,c.mipInt.value=this._lodMax-i;const h=this._sizeLods[n],d=3*h*(n>this._lodMax-es?n-this._lodMax+es:0),u=4*(this._cubeSize-h);Yn(t,d,u,3*h,2*h),a.setRenderTarget(t),a.render(l,fs)}}function Bm(r){const e=[],t=[];let i=r;const n=r-es+1+Fm;for(let s=0;s<n;s++){const a=Math.pow(2,i);e.push(a);const o=1/(a-2),l=-o,c=1+o,h=[l,l,c,l,c,c,l,l,c,c,l,c],d=6,u=6,f=3,m=new Float32Array(f*u*d),y=new Float32Array(f*u*d);for(let _=0;_<d;_++){const T=_%3*2/3-1,A=_>2?0:-1,S=[T,A,0,T+2/3,A,0,T+2/3,A+1,0,T,A,0,T+2/3,A+1,0,T,A+1,0];m.set(S,f*u*_);for(let M=0;M<u;M++){const E=h[M*2]*2-1,C=h[M*2+1]*2-1;_===0?Sn.set(1,C,E):_===1?Sn.set(-E,1,-C):_===2?Sn.set(-E,C,1):_===3?Sn.set(-1,C,-E):_===4?Sn.set(-E,-1,C):Sn.set(E,C,-1),Sn.toArray(y,(_*u+M)*f)}}const p=new en;p.setAttribute("position",new Ji(m,f)),p.setAttribute("outputDirection",new Ji(y,f)),t.push(new Ui(p,null)),i>es&&i--}return{lodMeshes:t,sizeLods:e}}function uc(r,e,t){const i=new vi(r,e,t);return i.texture.mapping=jr,i.texture.name="PMREM.cubeUv",i.scissorTest=!0,i}function Yn(r,e,t,i,n){r.viewport.set(e,t,i,n),r.scissor.set(e,t,i,n)}function Hm(r,e,t){return new Si({name:"PMREMGGXConvolution",defines:{GGX_SAMPLES:Um,CUBEUV_TEXEL_WIDTH:1/e,CUBEUV_TEXEL_HEIGHT:1/t,CUBEUV_MAX_MIP:`${r}.0`},uniforms:{envMap:{value:null},roughness:{value:0},mipInt:{value:0}},vertexShader:Zr(),fragmentShader:`

			precision highp float;
			precision highp int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform float roughness;
			uniform float mipInt;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			#define PI 3.14159265359

			// Van der Corput radical inverse
			float radicalInverse_VdC(uint bits) {
				bits = (bits << 16u) | (bits >> 16u);
				bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
				bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
				bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
				bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
				return float(bits) * 2.3283064365386963e-10; // / 0x100000000
			}

			// Hammersley sequence
			vec2 hammersley(uint i, uint N) {
				return vec2(float(i) / float(N), radicalInverse_VdC(i));
			}

			// GGX VNDF importance sampling (Eric Heitz 2018)
			// "Sampling the GGX Distribution of Visible Normals"
			// https://jcgt.org/published/0007/04/01/
			vec3 importanceSampleGGX_VNDF(vec2 Xi, vec3 V, float roughness) {
				float alpha = roughness * roughness;

				// Section 4.1: Orthonormal basis
				vec3 T1 = vec3(1.0, 0.0, 0.0);
				vec3 T2 = cross(V, T1);

				// Section 4.2: Parameterization of projected area
				float r = sqrt(Xi.x);
				float phi = 2.0 * PI * Xi.y;
				float t1 = r * cos(phi);
				float t2 = r * sin(phi);
				float s = 0.5 * (1.0 + V.z);
				t2 = (1.0 - s) * sqrt(1.0 - t1 * t1) + s * t2;

				// Section 4.3: Reprojection onto hemisphere
				vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * V;

				// Section 3.4: Transform back to ellipsoid configuration
				return normalize(vec3(alpha * Nh.x, alpha * Nh.y, max(0.0, Nh.z)));
			}

			void main() {
				vec3 N = normalize(vOutputDirection);
				vec3 V = N; // Assume view direction equals normal for pre-filtering

				vec3 prefilteredColor = vec3(0.0);
				float totalWeight = 0.0;

				// For very low roughness, just sample the environment directly
				if (roughness < 0.001) {
					gl_FragColor = vec4(bilinearCubeUV(envMap, N, mipInt), 1.0);
					return;
				}

				// Tangent space basis for VNDF sampling
				vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
				vec3 tangent = normalize(cross(up, N));
				vec3 bitangent = cross(N, tangent);

				for(uint i = 0u; i < uint(GGX_SAMPLES); i++) {
					vec2 Xi = hammersley(i, uint(GGX_SAMPLES));

					// For PMREM, V = N, so in tangent space V is always (0, 0, 1)
					vec3 H_tangent = importanceSampleGGX_VNDF(Xi, vec3(0.0, 0.0, 1.0), roughness);

					// Transform H back to world space
					vec3 H = normalize(tangent * H_tangent.x + bitangent * H_tangent.y + N * H_tangent.z);
					vec3 L = normalize(2.0 * dot(V, H) * H - V);

					float NdotL = max(dot(N, L), 0.0);

					if(NdotL > 0.0) {
						// Sample environment at fixed mip level
						// VNDF importance sampling handles the distribution filtering
						vec3 sampleColor = bilinearCubeUV(envMap, L, mipInt);

						// Weight by NdotL for the split-sum approximation
						// VNDF PDF naturally accounts for the visible microfacet distribution
						prefilteredColor += sampleColor * NdotL;
						totalWeight += NdotL;
					}
				}

				if (totalWeight > 0.0) {
					prefilteredColor = prefilteredColor / totalWeight;
				}

				gl_FragColor = vec4(prefilteredColor, 1.0);
			}
		`,blending:Ki,depthTest:!1,depthWrite:!1})}function Gm(r,e,t){return new Si({name:"SphericalGaussianBlur",defines:{SAMPLES:Om,CUBEUV_TEXEL_WIDTH:1/e,CUBEUV_TEXEL_HEIGHT:1/t,CUBEUV_MAX_MIP:`${r}.0`},uniforms:{envMap:{value:null},sigma:{value:0},mipInt:{value:0}},vertexShader:Zr(),fragmentShader:`

			precision highp float;
			precision highp int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform float sigma;
			uniform float mipInt;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			#define PI 3.14159265359
			#define GOLDEN_ANGLE 2.39996322973

			void main() {

				if ( sigma == 0.0 ) {

					gl_FragColor = vec4( bilinearCubeUV( envMap, vOutputDirection, mipInt ), 1.0 );
					return;

				}

				vec3 outputDirection = normalize( vOutputDirection );

				vec3 up = abs( outputDirection.z ) < 0.999 ? vec3( 0.0, 0.0, 1.0 ) : vec3( 1.0, 0.0, 0.0 );
				vec3 tangent = normalize( cross( up, outputDirection ) );
				vec3 bitangent = cross( outputDirection, tangent );

				// Truncate the kernel at three standard deviations or at the antipode.
				float thetaMax = min( 3.0 * sigma, PI );
				float truncation = 1.0 - exp( - 0.5 * thetaMax * thetaMax / ( sigma * sigma ) );

				vec3 accumColor = vec3( 0.0 );
				float accumWeight = 0.0;

				for ( int i = 0; i < SAMPLES; i ++ ) {

					// Stratified inverse-CDF sampling of the Gaussian, placed on a golden-angle spiral.
					float stratum = ( float( i ) + 0.5 ) / float( SAMPLES );
					float theta = sigma * sqrt( - 2.0 * log( 1.0 - stratum * truncation ) );
					float phi = float( i ) * GOLDEN_ANGLE;

					vec3 offset = cos( phi ) * tangent + sin( phi ) * bitangent;
					vec3 sampleDirection = cos( theta ) * outputDirection + sin( theta ) * offset;

					// Correct the planar sample density to solid angle.
					float weight = sin( theta ) / theta;

					accumColor += weight * bilinearCubeUV( envMap, sampleDirection, mipInt );
					accumWeight += weight;

				}

				gl_FragColor = vec4( accumColor / accumWeight, 1.0 );

			}
		`,blending:Ki,depthTest:!1,depthWrite:!1})}function dc(){return new Si({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:Zr(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:Ki,depthTest:!1,depthWrite:!1})}function fc(){return new Si({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:Zr(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:Ki,depthTest:!1,depthWrite:!1})}function Zr(){return`

		precision mediump float;
		precision mediump int;

		attribute vec3 outputDirection;

		varying vec3 vOutputDirection;

		void main() {

			vOutputDirection = outputDirection;
			gl_Position = vec4( position, 1.0 );

		}
	`}class Xu extends vi{constructor(e=1,t={}){super(e,e,t),this.isWebGLCubeRenderTarget=!0;const i={width:e,height:e,depth:1},n=[i,i,i,i,i,i];this.texture=new Bu(n),this._setTextureOptions(t),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;const i={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},n=new ks(5,5,5),s=new Si({name:"CubemapFromEquirect",uniforms:rs(i.uniforms),vertexShader:i.vertexShader,fragmentShader:i.fragmentShader,side:qt,blending:Ki});s.uniforms.tEquirect.value=t;const a=new Ui(n,s),o=t.minFilter;return t.minFilter===Tn&&(t.minFilter=Dt),new Xf(1,10,this).update(e,a),t.minFilter=o,a.geometry.dispose(),a.material.dispose(),this}clear(e,t=!0,i=!0,n=!0){const s=e.getRenderTarget();for(let a=0;a<6;a++)e.setRenderTarget(this,a),e.clear(t,i,n);e.setRenderTarget(s)}}function zm(r){let e=new WeakMap,t=new WeakMap,i=null;function n(u,f=!1){return u==null?null:f?a(u):s(u)}function s(u){if(u&&u.isTexture){const f=u.mapping;if(f===la||f===ca)if(e.has(u)){const m=e.get(u).texture;return o(m,u.mapping)}else{const m=u.image;if(m&&m.height>0){const y=new Xu(m.height);return y.fromEquirectangularTexture(r,u),e.set(u,y),u.addEventListener("dispose",c),o(y.texture,u.mapping)}else return null}}return u}function a(u){if(u&&u.isTexture){const f=u.mapping,m=f===la||f===ca,y=f===Rn||f===ss;if(m||y){let p=t.get(u);const _=p!==void 0?p.texture.pmremVersion:0;if(u.isRenderTargetTexture&&u.pmremVersion!==_)return i===null&&(i=new hc(r)),p=m?i.fromEquirectangular(u,p):i.fromCubemap(u,p),p.texture.pmremVersion=u.pmremVersion,t.set(u,p),p.texture;if(p!==void 0)return p.texture;{const T=u.image;return m&&T&&T.height>0||y&&T&&l(T)?(i===null&&(i=new hc(r)),p=m?i.fromEquirectangular(u):i.fromCubemap(u),p.texture.pmremVersion=u.pmremVersion,t.set(u,p),u.addEventListener("dispose",h),p.texture):null}}}return u}function o(u,f){return f===la?u.mapping=Rn:f===ca&&(u.mapping=ss),u}function l(u){let f=0;const m=6;for(let y=0;y<m;y++)u[y]!==void 0&&f++;return f===m}function c(u){const f=u.target;f.removeEventListener("dispose",c);const m=e.get(f);m!==void 0&&(e.delete(f),m.dispose())}function h(u){const f=u.target;f.removeEventListener("dispose",h);const m=t.get(f);m!==void 0&&(t.delete(f),m.dispose())}function d(){e=new WeakMap,t=new WeakMap,i!==null&&(i.dispose(),i=null)}return{get:n,dispose:d}}function Wm(r){const e={};function t(i){if(e[i]!==void 0)return e[i];const n=r.getExtension(i);return e[i]=n,n}return{has:function(i){return t(i)!==null},init:function(){t("EXT_color_buffer_float"),t("WEBGL_clip_cull_distance"),t("OES_texture_float_linear"),t("EXT_color_buffer_half_float"),t("WEBGL_multisampled_render_to_texture"),t("WEBGL_render_shared_exponent")},get:function(i){const n=t(i);return n===null&&ts("WebGLRenderer: "+i+" extension not supported."),n}}}function Vm(r,e,t,i){const n={},s=new WeakMap;function a(d){const u=d.target;u.index!==null&&e.remove(u.index);for(const m in u.attributes)e.remove(u.attributes[m]);u.removeEventListener("dispose",a),delete n[u.id];const f=s.get(u);f&&(e.remove(f),s.delete(u)),i.releaseStatesOfGeometry(u),u.isInstancedBufferGeometry===!0&&delete u._maxInstanceCount,t.memory.geometries--}function o(d,u){return n[u.id]===!0||(u.addEventListener("dispose",a),n[u.id]=!0,t.memory.geometries++),u}function l(d){const u=d.attributes;for(const f in u)e.update(u[f],r.ARRAY_BUFFER)}function c(d){const u=[],f=d.index,m=d.attributes.position;let y=0;if(m===void 0)return;if(f!==null){const T=f.array;y=f.version;for(let A=0,S=T.length;A<S;A+=3){const M=T[A+0],E=T[A+1],C=T[A+2];u.push(M,E,E,C,C,M)}}else{const T=m.array;y=m.version;for(let A=0,S=T.length/3-1;A<S;A+=3){const M=A+0,E=A+1,C=A+2;u.push(M,E,E,C,C,M)}}const p=new(m.count>=65535?Fu:Nu)(u,1);p.version=y;const _=s.get(d);_&&e.remove(_),s.set(d,p)}function h(d){const u=s.get(d);if(u){const f=d.index;f!==null&&u.version<f.version&&c(d)}else c(d);return s.get(d)}return{get:o,update:l,getWireframeAttribute:h}}function Xm(r,e,t){let i;function n(d){i=d}let s,a;function o(d){s=d.type,a=d.bytesPerElement}function l(d,u){r.drawElements(i,u,s,d*a),t.update(u,i,1)}function c(d,u,f){f!==0&&(r.drawElementsInstanced(i,u,s,d*a,f),t.update(u,i,f))}function h(d,u,f){if(f===0)return;e.get("WEBGL_multi_draw").multiDrawElementsWEBGL(i,u,0,s,d,0,f);let y=0;for(let p=0;p<f;p++)y+=u[p];t.update(y,i,1)}this.setMode=n,this.setIndex=o,this.render=l,this.renderInstances=c,this.renderMultiDraw=h}function qm(r){const e={geometries:0,textures:0},t={frame:0,calls:0,triangles:0,points:0,lines:0};function i(s,a,o){switch(t.calls++,a){case r.TRIANGLES:t.triangles+=o*(s/3);break;case r.LINES:t.lines+=o*(s/2);break;case r.LINE_STRIP:t.lines+=o*(s-1);break;case r.LINE_LOOP:t.lines+=o*s;break;case r.POINTS:t.points+=o*s;break;default:Ke("WebGLInfo: Unknown draw mode:",a);break}}function n(){t.calls=0,t.triangles=0,t.points=0,t.lines=0}return{memory:e,render:t,programs:null,autoReset:!0,reset:n,update:i}}function Ym(r,e,t){const i=new WeakMap,n=new xt;function s(a,o,l){const c=a.morphTargetInfluences,h=o.morphAttributes.position||o.morphAttributes.normal||o.morphAttributes.color,d=h!==void 0?h.length:0;let u=i.get(o);if(u===void 0||u.count!==d){let R=function(){g.dispose(),i.delete(o),o.removeEventListener("dispose",R)};var f=R;u!==void 0&&u.texture.dispose();const m=o.morphAttributes.position!==void 0,y=o.morphAttributes.normal!==void 0,p=o.morphAttributes.color!==void 0,_=o.morphAttributes.position||[],T=o.morphAttributes.normal||[],A=o.morphAttributes.color||[];let S=0;m===!0&&(S=1),y===!0&&(S=2),p===!0&&(S=3);let M=o.attributes.position.count*S,E=1;M>e.maxTextureSize&&(E=Math.ceil(M/e.maxTextureSize),M=e.maxTextureSize);const C=new Float32Array(M*E*4*d),g=new Iu(C,M,E,d);g.type=Di,g.needsUpdate=!0;const w=S*4;for(let P=0;P<d;P++){const O=_[P],B=T[P],N=A[P],H=M*E*4*P;for(let J=0;J<O.count;J++){const V=J*w;m===!0&&(n.fromBufferAttribute(O,J),C[H+V+0]=n.x,C[H+V+1]=n.y,C[H+V+2]=n.z,C[H+V+3]=0),y===!0&&(n.fromBufferAttribute(B,J),C[H+V+4]=n.x,C[H+V+5]=n.y,C[H+V+6]=n.z,C[H+V+7]=0),p===!0&&(n.fromBufferAttribute(N,J),C[H+V+8]=n.x,C[H+V+9]=n.y,C[H+V+10]=n.z,C[H+V+11]=N.itemSize===4?n.w:1)}}u={count:d,texture:g,size:new Ge(M,E)},i.set(o,u),o.addEventListener("dispose",R)}if(a.isInstancedMesh===!0&&a.morphTexture!==null)l.getUniforms().setValue(r,"morphTexture",a.morphTexture,t);else{let m=0;for(let p=0;p<c.length;p++)m+=c[p];const y=o.morphTargetsRelative?1:1-m;l.getUniforms().setValue(r,"morphTargetBaseInfluence",y),l.getUniforms().setValue(r,"morphTargetInfluences",c)}l.getUniforms().setValue(r,"morphTargetsTexture",u.texture,t),l.getUniforms().setValue(r,"morphTargetsTextureSize",u.size)}return{update:s}}function $m(r,e,t,i,n){let s=new WeakMap;function a(c){const h=n.render.frame,d=c.geometry,u=e.get(c,d);if(s.get(u)!==h&&(e.update(u),s.set(u,h)),c.isInstancedMesh&&(c.hasEventListener("dispose",l)===!1&&c.addEventListener("dispose",l),s.get(c)!==h&&(t.update(c.instanceMatrix,r.ARRAY_BUFFER),c.instanceColor!==null&&t.update(c.instanceColor,r.ARRAY_BUFFER),s.set(c,h))),c.isSkinnedMesh){const f=c.skeleton;s.get(f)!==h&&(f.update(),s.set(f,h))}return u}function o(){s=new WeakMap}function l(c){const h=c.target;h.removeEventListener("dispose",l),i.releaseStatesOfObject(h),t.remove(h.instanceMatrix),h.instanceColor!==null&&t.remove(h.instanceColor)}return{update:a,dispose:o}}const Km={[_u]:"LINEAR_TONE_MAPPING",[mu]:"REINHARD_TONE_MAPPING",[gu]:"CINEON_TONE_MAPPING",[xu]:"ACES_FILMIC_TONE_MAPPING",[vu]:"AGX_TONE_MAPPING",[Su]:"NEUTRAL_TONE_MAPPING",[yu]:"CUSTOM_TONE_MAPPING"};function jm(r,e,t,i,n,s){const a=new vi(e,t,{type:r,depthBuffer:n,stencilBuffer:s,samples:i?4:0,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,resolveDepthBuffer:!1,resolveStencilBuffer:!1});let o=null,l=null;const c=new en;c.setAttribute("position",new Zi([-1,3,0,-1,-1,0,3,-1,0],3)),c.setAttribute("uv",new Zi([0,2,0,0,2,0],2));const h=new zf({uniforms:{tDiffuse:{value:null}},vertexShader:`
			precision highp float;

			uniform mat4 modelViewMatrix;
			uniform mat4 projectionMatrix;

			attribute vec3 position;
			attribute vec2 uv;

			varying vec2 vUv;

			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}`,fragmentShader:`
			precision highp float;

			uniform sampler2D tDiffuse;

			varying vec2 vUv;

			#include <tonemapping_pars_fragment>
			#include <colorspace_pars_fragment>

			void main() {
				gl_FragColor = texture2D( tDiffuse, vUv );

				#ifdef LINEAR_TONE_MAPPING
					gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );
				#elif defined( REINHARD_TONE_MAPPING )
					gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );
				#elif defined( CINEON_TONE_MAPPING )
					gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );
				#elif defined( ACES_FILMIC_TONE_MAPPING )
					gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );
				#elif defined( AGX_TONE_MAPPING )
					gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );
				#elif defined( NEUTRAL_TONE_MAPPING )
					gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );
				#elif defined( CUSTOM_TONE_MAPPING )
					gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );
				#endif

				#ifdef SRGB_TRANSFER
					gl_FragColor = sRGBTransferOETF( gl_FragColor );
				#endif
			}`,depthTest:!1,depthWrite:!1}),d=new Ui(c,h),u=new al(-1,1,1,-1,0,1);let f=null,m=null,y=!1,p,_=null,T=[],A=!1;this.setSize=function(S,M){a.setSize(S,M),o!==null&&o.setSize(S,M),l!==null&&l.setSize(S,M);for(let E=0;E<T.length;E++){const C=T[E];C.setSize&&C.setSize(S,M)}},this.setEffects=function(S){T=S,A=T.length>0&&T[0].isRenderPass===!0;const M=a.width,E=a.height;T.length>0&&o===null&&(o=new vi(M,E,{type:Oi,depthBuffer:!1,stencilBuffer:!1}),l=new vi(M,E,{type:Oi,depthBuffer:!1,stencilBuffer:!1}));for(let C=0;C<T.length;C++){const g=T[C];g.setSize&&g.setSize(M,E)}},this.begin=function(S,M){if(y||S.toneMapping===Ni&&T.length===0)return!1;if(_=M,M!==null){const E=M.width,C=M.height;(a.width!==E||a.height!==C)&&this.setSize(E,C)}return A===!1&&S.setRenderTarget(a),p=S.toneMapping,S.toneMapping=Ni,!0},this.hasRenderPass=function(){return A},this.end=function(S,M){S.toneMapping=p,y=!0;let E=a,C=o;for(let g=0;g<T.length;g++){const w=T[g];w.enabled!==!1&&(w.render(S,C,E,M),w.needsSwap!==!1&&(E=C,C=C===o?l:o))}if(f!==S.outputColorSpace||m!==S.toneMapping){f=S.outputColorSpace,m=S.toneMapping,h.defines={},We.getTransfer(f)===nt&&(h.defines.SRGB_TRANSFER="");const g=Km[m];g&&(h.defines[g]=""),h.needsUpdate=!0}h.uniforms.tDiffuse.value=E.texture,S.setRenderTarget(_),S.render(d,u),_=null,y=!1},this.isCompositing=function(){return y},this.dispose=function(){a.dispose(),o!==null&&o.dispose(),l!==null&&l.dispose(),c.dispose(),h.dispose()}}const qu=new kt,Yo=new Ns(1,1),Yu=new Iu,$u=new xf,Ku=new Bu,pc=[],_c=[],mc=new Float32Array(16),gc=new Float32Array(9),xc=new Float32Array(4);function os(r,e,t){const i=r[0];if(i<=0||i>0)return r;const n=e*t;let s=pc[n];if(s===void 0&&(s=new Float32Array(n),pc[n]=s),e!==0){i.toArray(s,0);for(let a=1,o=0;a!==e;++a)o+=t,r[a].toArray(s,o)}return s}function At(r,e){if(r.length!==e.length)return!1;for(let t=0,i=r.length;t<i;t++)if(r[t]!==e[t])return!1;return!0}function Ct(r,e){for(let t=0,i=e.length;t<i;t++)r[t]=e[t]}function Qr(r,e){let t=_c[e];t===void 0&&(t=new Int32Array(e),_c[e]=t);for(let i=0;i!==e;++i)t[i]=r.allocateTextureUnit();return t}function Jm(r,e){const t=this.cache;t[0]!==e&&(r.uniform1f(this.addr,e),t[0]=e)}function Zm(r,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(r.uniform2f(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(At(t,e))return;r.uniform2fv(this.addr,e),Ct(t,e)}}function Qm(r,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(r.uniform3f(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else if(e.r!==void 0)(t[0]!==e.r||t[1]!==e.g||t[2]!==e.b)&&(r.uniform3f(this.addr,e.r,e.g,e.b),t[0]=e.r,t[1]=e.g,t[2]=e.b);else{if(At(t,e))return;r.uniform3fv(this.addr,e),Ct(t,e)}}function eg(r,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(r.uniform4f(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(At(t,e))return;r.uniform4fv(this.addr,e),Ct(t,e)}}function tg(r,e){const t=this.cache,i=e.elements;if(i===void 0){if(At(t,e))return;r.uniformMatrix2fv(this.addr,!1,e),Ct(t,e)}else{if(At(t,i))return;xc.set(i),r.uniformMatrix2fv(this.addr,!1,xc),Ct(t,i)}}function ig(r,e){const t=this.cache,i=e.elements;if(i===void 0){if(At(t,e))return;r.uniformMatrix3fv(this.addr,!1,e),Ct(t,e)}else{if(At(t,i))return;gc.set(i),r.uniformMatrix3fv(this.addr,!1,gc),Ct(t,i)}}function ng(r,e){const t=this.cache,i=e.elements;if(i===void 0){if(At(t,e))return;r.uniformMatrix4fv(this.addr,!1,e),Ct(t,e)}else{if(At(t,i))return;mc.set(i),r.uniformMatrix4fv(this.addr,!1,mc),Ct(t,i)}}function sg(r,e){const t=this.cache;t[0]!==e&&(r.uniform1i(this.addr,e),t[0]=e)}function rg(r,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(r.uniform2i(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(At(t,e))return;r.uniform2iv(this.addr,e),Ct(t,e)}}function ag(r,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(r.uniform3i(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(At(t,e))return;r.uniform3iv(this.addr,e),Ct(t,e)}}function og(r,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(r.uniform4i(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(At(t,e))return;r.uniform4iv(this.addr,e),Ct(t,e)}}function lg(r,e){const t=this.cache;t[0]!==e&&(r.uniform1ui(this.addr,e),t[0]=e)}function cg(r,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(r.uniform2ui(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(At(t,e))return;r.uniform2uiv(this.addr,e),Ct(t,e)}}function hg(r,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(r.uniform3ui(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(At(t,e))return;r.uniform3uiv(this.addr,e),Ct(t,e)}}function ug(r,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(r.uniform4ui(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(At(t,e))return;r.uniform4uiv(this.addr,e),Ct(t,e)}}function dg(r,e,t){const i=this.cache,n=t.allocateTextureUnit();i[0]!==n&&(r.uniform1i(this.addr,n),i[0]=n);let s;this.type===r.SAMPLER_2D_SHADOW?(Yo.compareFunction=t.isReversedDepthBuffer()?nl:il,s=Yo):s=qu,t.setTexture2D(e||s,n)}function fg(r,e,t){const i=this.cache,n=t.allocateTextureUnit();i[0]!==n&&(r.uniform1i(this.addr,n),i[0]=n),t.setTexture3D(e||$u,n)}function pg(r,e,t){const i=this.cache,n=t.allocateTextureUnit();i[0]!==n&&(r.uniform1i(this.addr,n),i[0]=n),t.setTextureCube(e||Ku,n)}function _g(r,e,t){const i=this.cache,n=t.allocateTextureUnit();i[0]!==n&&(r.uniform1i(this.addr,n),i[0]=n),t.setTexture2DArray(e||Yu,n)}function mg(r){switch(r){case 5126:return Jm;case 35664:return Zm;case 35665:return Qm;case 35666:return eg;case 35674:return tg;case 35675:return ig;case 35676:return ng;case 5124:case 35670:return sg;case 35667:case 35671:return rg;case 35668:case 35672:return ag;case 35669:case 35673:return og;case 5125:return lg;case 36294:return cg;case 36295:return hg;case 36296:return ug;case 35678:case 36198:case 36298:case 36306:case 35682:return dg;case 35679:case 36299:case 36307:return fg;case 35680:case 36300:case 36308:case 36293:return pg;case 36289:case 36303:case 36311:case 36292:return _g}}function gg(r,e){r.uniform1fv(this.addr,e)}function xg(r,e){const t=os(e,this.size,2);r.uniform2fv(this.addr,t)}function yg(r,e){const t=os(e,this.size,3);r.uniform3fv(this.addr,t)}function vg(r,e){const t=os(e,this.size,4);r.uniform4fv(this.addr,t)}function Sg(r,e){const t=os(e,this.size,4);r.uniformMatrix2fv(this.addr,!1,t)}function Mg(r,e){const t=os(e,this.size,9);r.uniformMatrix3fv(this.addr,!1,t)}function Eg(r,e){const t=os(e,this.size,16);r.uniformMatrix4fv(this.addr,!1,t)}function wg(r,e){r.uniform1iv(this.addr,e)}function Tg(r,e){r.uniform2iv(this.addr,e)}function bg(r,e){r.uniform3iv(this.addr,e)}function Ag(r,e){r.uniform4iv(this.addr,e)}function Cg(r,e){r.uniform1uiv(this.addr,e)}function Rg(r,e){r.uniform2uiv(this.addr,e)}function Pg(r,e){r.uniform3uiv(this.addr,e)}function Ig(r,e){r.uniform4uiv(this.addr,e)}function Dg(r,e,t){const i=this.cache,n=e.length,s=Qr(t,n);At(i,s)||(r.uniform1iv(this.addr,s),Ct(i,s));let a;this.type===r.SAMPLER_2D_SHADOW?a=Yo:a=qu;for(let o=0;o!==n;++o)t.setTexture2D(e[o]||a,s[o])}function Lg(r,e,t){const i=this.cache,n=e.length,s=Qr(t,n);At(i,s)||(r.uniform1iv(this.addr,s),Ct(i,s));for(let a=0;a!==n;++a)t.setTexture3D(e[a]||$u,s[a])}function Ng(r,e,t){const i=this.cache,n=e.length,s=Qr(t,n);At(i,s)||(r.uniform1iv(this.addr,s),Ct(i,s));for(let a=0;a!==n;++a)t.setTextureCube(e[a]||Ku,s[a])}function Fg(r,e,t){const i=this.cache,n=e.length,s=Qr(t,n);At(i,s)||(r.uniform1iv(this.addr,s),Ct(i,s));for(let a=0;a!==n;++a)t.setTexture2DArray(e[a]||Yu,s[a])}function Og(r){switch(r){case 5126:return gg;case 35664:return xg;case 35665:return yg;case 35666:return vg;case 35674:return Sg;case 35675:return Mg;case 35676:return Eg;case 5124:case 35670:return wg;case 35667:case 35671:return Tg;case 35668:case 35672:return bg;case 35669:case 35673:return Ag;case 5125:return Cg;case 36294:return Rg;case 36295:return Pg;case 36296:return Ig;case 35678:case 36198:case 36298:case 36306:case 35682:return Dg;case 35679:case 36299:case 36307:return Lg;case 35680:case 36300:case 36308:case 36293:return Ng;case 36289:case 36303:case 36311:case 36292:return Fg}}class Ug{constructor(e,t,i){this.id=e,this.addr=i,this.cache=[],this.type=t.type,this.setValue=mg(t.type)}}class kg{constructor(e,t,i){this.id=e,this.addr=i,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=Og(t.type)}}class Bg{constructor(e){this.id=e,this.seq=[],this.map={}}setValue(e,t,i){const n=this.seq;for(let s=0,a=n.length;s!==a;++s){const o=n[s];o.setValue(e,t[o.id],i)}}}const ka=/(\w+)(\])?(\[|\.)?/g;function yc(r,e){r.seq.push(e),r.map[e.id]=e}function Hg(r,e,t){const i=r.name,n=i.length;for(ka.lastIndex=0;;){const s=ka.exec(i),a=ka.lastIndex;let o=s[1];const l=s[2]==="]",c=s[3];if(l&&(o=o|0),c===void 0||c==="["&&a+2===n){yc(t,c===void 0?new Ug(o,r,e):new kg(o,r,e));break}else{let d=t.map[o];d===void 0&&(d=new Bg(o),yc(t,d)),t=d}}}class Fr{constructor(e,t){this.seq=[],this.map={};const i=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let a=0;a<i;++a){const o=e.getActiveUniform(t,a),l=e.getUniformLocation(t,o.name);Hg(o,l,this)}const n=[],s=[];for(const a of this.seq)a.type===e.SAMPLER_2D_SHADOW||a.type===e.SAMPLER_CUBE_SHADOW||a.type===e.SAMPLER_2D_ARRAY_SHADOW?n.push(a):s.push(a);n.length>0&&(this.seq=n.concat(s))}setValue(e,t,i,n){const s=this.map[t];s!==void 0&&s.setValue(e,i,n)}setOptional(e,t,i){const n=t[i];n!==void 0&&this.setValue(e,i,n)}static upload(e,t,i,n){for(let s=0,a=t.length;s!==a;++s){const o=t[s],l=i[o.id];l.needsUpdate!==!1&&o.setValue(e,l.value,n)}}static seqWithValue(e,t){const i=[];for(let n=0,s=e.length;n!==s;++n){const a=e[n];a.id in t&&i.push(a)}return i}}function vc(r,e,t){const i=r.createShader(e);return r.shaderSource(i,t),r.compileShader(i),i}const Gg=37297;let zg=0;function Wg(r,e){const t=r.split(`
`),i=[],n=Math.max(e-6,0),s=Math.min(e+6,t.length);for(let a=n;a<s;a++){const o=a+1;i.push(`${o===e?">":" "} ${o}: ${t[a]}`)}return i.join(`
`)}const Sc=new Ie;function Vg(r){We._getMatrix(Sc,We.workingColorSpace,r);const e=`mat3( ${Sc.elements.map(t=>t.toFixed(4))} )`;switch(We.getTransfer(r)){case Gr:return[e,"LinearTransferOETF"];case nt:return[e,"sRGBTransferOETF"];default:return Re("WebGLProgram: Unsupported color space: ",r),[e,"LinearTransferOETF"]}}function Mc(r,e,t){const i=r.getShaderParameter(e,r.COMPILE_STATUS),s=(r.getShaderInfoLog(e)||"").trim();if(i&&s==="")return"";const a=/ERROR: 0:(\d+)/.exec(s);if(a){const o=parseInt(a[1]);return t.toUpperCase()+`

`+s+`

`+Wg(r.getShaderSource(e),o)}else return s}function Xg(r,e){const t=Vg(e);return[`vec4 ${r}( vec4 value ) {`,`	return ${t[1]}( vec4( value.rgb * ${t[0]}, value.a ) );`,"}"].join(`
`)}const qg={[_u]:"Linear",[mu]:"Reinhard",[gu]:"Cineon",[xu]:"ACESFilmic",[vu]:"AgX",[Su]:"Neutral",[yu]:"Custom"};function Yg(r,e){const t=qg[e];return t===void 0?(Re("WebGLProgram: Unsupported toneMapping:",e),"vec3 "+r+"( vec3 color ) { return LinearToneMapping( color ); }"):"vec3 "+r+"( vec3 color ) { return "+t+"ToneMapping( color ); }"}const dr=new z;function $g(){We.getLuminanceCoefficients(dr);const r=dr.x.toFixed(4),e=dr.y.toFixed(4),t=dr.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${r}, ${e}, ${t} );`,"	return dot( weights, rgb );","}"].join(`
`)}function Kg(r){return[r.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",r.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(Ts).join(`
`)}function jg(r){const e=[];for(const t in r){const i=r[t];i!==!1&&e.push("#define "+t+" "+i)}return e.join(`
`)}function Jg(r,e){const t={},i=r.getProgramParameter(e,r.ACTIVE_ATTRIBUTES);for(let n=0;n<i;n++){const s=r.getActiveAttrib(e,n),a=s.name;let o=1;s.type===r.FLOAT_MAT2&&(o=2),s.type===r.FLOAT_MAT3&&(o=3),s.type===r.FLOAT_MAT4&&(o=4),t[a]={type:s.type,location:r.getAttribLocation(e,a),locationSize:o}}return t}function Ts(r){return r!==""}function Ec(r,e){const t=e.numSpotLightShadows+e.numSpotLightMaps-e.numSpotLightShadowsWithMaps;return r.replace(/NUM_SUN_LIGHTS/g,e.numSunLights).replace(/NUM_DIR_LIGHTS/g,e.numDirLights).replace(/NUM_SPOT_LIGHTS/g,e.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,e.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,t).replace(/NUM_RECT_AREA_LIGHTS/g,e.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,e.numPointLights).replace(/NUM_HEMI_LIGHTS/g,e.numHemiLights).replace(/NUM_SUN_LIGHT_SHADOWS/g,e.numSunLightShadows).replace(/NUM_DIR_LIGHT_SHADOWS/g,e.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,e.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,e.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,e.numPointLightShadows)}function wc(r,e){return r.replace(/NUM_CLIPPING_PLANES/g,e.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,e.numClippingPlanes-e.numClipIntersection)}const Zg=/^[ \t]*#include +<([\w\d./]+)>/gm;function $o(r){return r.replace(Zg,e0)}const Qg=new Map;function e0(r,e){let t=Ne[e];if(t===void 0){const i=Qg.get(e);if(i!==void 0)t=Ne[i],Re('WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',e,i);else throw new Error("THREE.WebGLProgram: Can not resolve #include <"+e+">")}return $o(t)}const t0=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function Tc(r){return r.replace(t0,i0)}function i0(r,e,t,i){let n="";for(let s=parseInt(e);s<parseInt(t);s++)n+=i.replace(/\[\s*i\s*\]/g,"[ "+s+" ]").replace(/UNROLLED_LOOP_INDEX/g,s);return n}function bc(r){let e=`precision ${r.precision} float;
	precision ${r.precision} int;
	precision ${r.precision} sampler2D;
	precision ${r.precision} samplerCube;
	precision ${r.precision} sampler3D;
	precision ${r.precision} sampler2DArray;
	precision ${r.precision} sampler2DShadow;
	precision ${r.precision} samplerCubeShadow;
	precision ${r.precision} sampler2DArrayShadow;
	precision ${r.precision} isampler2D;
	precision ${r.precision} isampler3D;
	precision ${r.precision} isamplerCube;
	precision ${r.precision} isampler2DArray;
	precision ${r.precision} usampler2D;
	precision ${r.precision} usampler3D;
	precision ${r.precision} usamplerCube;
	precision ${r.precision} usampler2DArray;
	`;return r.precision==="highp"?e+=`
#define HIGH_PRECISION`:r.precision==="mediump"?e+=`
#define MEDIUM_PRECISION`:r.precision==="lowp"&&(e+=`
#define LOW_PRECISION`),e}const n0={[Pr]:"SHADOWMAP_TYPE_PCF",[ws]:"SHADOWMAP_TYPE_VSM"};function s0(r){return n0[r.shadowMapType]||"SHADOWMAP_TYPE_BASIC"}const r0={[Rn]:"ENVMAP_TYPE_CUBE",[ss]:"ENVMAP_TYPE_CUBE",[jr]:"ENVMAP_TYPE_CUBE_UV"};function a0(r){return r.envMap===!1?"ENVMAP_TYPE_CUBE":r0[r.envMapMode]||"ENVMAP_TYPE_CUBE"}const o0={[ss]:"ENVMAP_MODE_REFRACTION"};function l0(r){return r.envMap===!1?"ENVMAP_MODE_REFLECTION":o0[r.envMapMode]||"ENVMAP_MODE_REFLECTION"}const c0={[pu]:"ENVMAP_BLENDING_MULTIPLY",[$d]:"ENVMAP_BLENDING_MIX",[Kd]:"ENVMAP_BLENDING_ADD"};function h0(r){return r.envMap===!1?"ENVMAP_BLENDING_NONE":c0[r.combine]||"ENVMAP_BLENDING_NONE"}function u0(r){const e=r.envMapCubeUVHeight;if(e===null)return null;const t=Math.log2(e)-2,i=1/e;return{texelWidth:1/(3*Math.max(Math.pow(2,t),7*16)),texelHeight:i,maxMip:t}}function d0(r,e,t,i){const n=r.getContext(),s=t.defines;let a=t.vertexShader,o=t.fragmentShader;const l=s0(t),c=a0(t),h=l0(t),d=h0(t),u=u0(t),f=Kg(t),m=jg(s),y=n.createProgram();let p,_,T=t.glslVersion?"#version "+t.glslVersion+`
`:"";t.isRawShaderMaterial?(p=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,m].filter(Ts).join(`
`),p.length>0&&(p+=`
`),_=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,m].filter(Ts).join(`
`),_.length>0&&(_+=`
`)):(p=[bc(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,m,t.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",t.batching?"#define USE_BATCHING":"",t.batchingColor?"#define USE_BATCHING_COLOR":"",t.instancing?"#define USE_INSTANCING":"",t.instancingColor?"#define USE_INSTANCING_COLOR":"",t.instancingMorph?"#define USE_INSTANCING_MORPH":"",t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.map?"#define USE_MAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+h:"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.displacementMap?"#define USE_DISPLACEMENTMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.mapUv?"#define MAP_UV "+t.mapUv:"",t.alphaMapUv?"#define ALPHAMAP_UV "+t.alphaMapUv:"",t.lightMapUv?"#define LIGHTMAP_UV "+t.lightMapUv:"",t.aoMapUv?"#define AOMAP_UV "+t.aoMapUv:"",t.emissiveMapUv?"#define EMISSIVEMAP_UV "+t.emissiveMapUv:"",t.bumpMapUv?"#define BUMPMAP_UV "+t.bumpMapUv:"",t.normalMapUv?"#define NORMALMAP_UV "+t.normalMapUv:"",t.displacementMapUv?"#define DISPLACEMENTMAP_UV "+t.displacementMapUv:"",t.metalnessMapUv?"#define METALNESSMAP_UV "+t.metalnessMapUv:"",t.roughnessMapUv?"#define ROUGHNESSMAP_UV "+t.roughnessMapUv:"",t.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+t.anisotropyMapUv:"",t.clearcoatMapUv?"#define CLEARCOATMAP_UV "+t.clearcoatMapUv:"",t.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+t.clearcoatNormalMapUv:"",t.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+t.clearcoatRoughnessMapUv:"",t.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+t.iridescenceMapUv:"",t.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+t.iridescenceThicknessMapUv:"",t.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+t.sheenColorMapUv:"",t.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+t.sheenRoughnessMapUv:"",t.specularMapUv?"#define SPECULARMAP_UV "+t.specularMapUv:"",t.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+t.specularColorMapUv:"",t.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+t.specularIntensityMapUv:"",t.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+t.transmissionMapUv:"",t.thicknessMapUv?"#define THICKNESSMAP_UV "+t.thicknessMapUv:"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexNormals?"#define HAS_NORMAL":"",t.vertexColors?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.flatShading?"#define FLAT_SHADED":"",t.skinning?"#define USE_SKINNING":"",t.morphTargets?"#define USE_MORPHTARGETS":"",t.morphNormals&&t.flatShading===!1?"#define USE_MORPHNORMALS":"",t.morphColors?"#define USE_MORPHCOLORS":"",t.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+t.morphTextureStride:"",t.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+t.morphTargetsCount:"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+l:"",t.sizeAttenuation?"#define USE_SIZEATTENUATION":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(Ts).join(`
`),_=[bc(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,m,t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",t.map?"#define USE_MAP":"",t.matcap?"#define USE_MATCAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+c:"",t.envMap?"#define "+h:"",t.envMap?"#define "+d:"",u?"#define CUBEUV_TEXEL_WIDTH "+u.texelWidth:"",u?"#define CUBEUV_TEXEL_HEIGHT "+u.texelHeight:"",u?"#define CUBEUV_MAX_MIP "+u.maxMip+".0":"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.packedNormalMap?"#define USE_PACKED_NORMALMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoat?"#define USE_CLEARCOAT":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.dispersion?"#define USE_DISPERSION":"",t.retroreflection?"#define USE_RETROREFLECTION":"",t.iridescence?"#define USE_IRIDESCENCE":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaTest?"#define USE_ALPHATEST":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.sheen?"#define USE_SHEEN":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors||t.instancingColor?"#define USE_COLOR":"",t.vertexAlphas||t.batchingColor?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.gradientMap?"#define USE_GRADIENTMAP":"",t.flatShading?"#define FLAT_SHADED":"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+l:"",t.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.numLightProbeGrids>0?"#define USE_LIGHT_PROBES_GRID":"",t.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",t.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",t.toneMapping!==Ni?"#define TONE_MAPPING":"",t.toneMapping!==Ni?Ne.tonemapping_pars_fragment:"",t.toneMapping!==Ni?Yg("toneMapping",t.toneMapping):"",t.dithering?"#define DITHERING":"",t.opaque?"#define OPAQUE":"",Ne.colorspace_pars_fragment,Xg("linearToOutputTexel",t.outputColorSpace),$g(),t.useDepthPacking?"#define DEPTH_PACKING "+t.depthPacking:"",`
`].filter(Ts).join(`
`)),a=$o(a),a=Ec(a,t),a=wc(a,t),o=$o(o),o=Ec(o,t),o=wc(o,t),a=Tc(a),o=Tc(o),t.isRawShaderMaterial!==!0&&(T=`#version 300 es
`,p=[f,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+p,_=["#define varying in",t.glslVersion===Gl?"":"layout(location = 0) out highp vec4 pc_fragColor;",t.glslVersion===Gl?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+_);const A=T+p+a,S=T+_+o,M=vc(n,n.VERTEX_SHADER,A),E=vc(n,n.FRAGMENT_SHADER,S);n.attachShader(y,M),n.attachShader(y,E),t.index0AttributeName!==void 0?n.bindAttribLocation(y,0,t.index0AttributeName):t.hasPositionAttribute===!0&&n.bindAttribLocation(y,0,"position"),n.linkProgram(y);function C(P){if(r.debug.checkShaderErrors){const O=n.getProgramInfoLog(y)||"",B=n.getShaderInfoLog(M)||"",N=n.getShaderInfoLog(E)||"",H=O.trim(),J=B.trim(),V=N.trim();let ne=!0,q=!0;if(n.getProgramParameter(y,n.LINK_STATUS)===!1)if(ne=!1,typeof r.debug.onShaderError=="function")r.debug.onShaderError(n,y,M,E);else{const ee=Mc(n,M,"vertex"),ie=Mc(n,E,"fragment");Ke("WebGLProgram: Shader Error "+n.getError()+" - VALIDATE_STATUS "+n.getProgramParameter(y,n.VALIDATE_STATUS)+`

Material Name: `+P.name+`
Material Type: `+P.type+`

Program Info Log: `+H+`
`+ee+`
`+ie)}else H!==""?Re("WebGLProgram: Program Info Log:",H):(J===""||V==="")&&(q=!1);q&&(P.diagnostics={runnable:ne,programLog:H,vertexShader:{log:J,prefix:p},fragmentShader:{log:V,prefix:_}})}n.deleteShader(M),n.deleteShader(E),g=new Fr(n,y),w=Jg(n,y)}let g;this.getUniforms=function(){return g===void 0&&C(this),g};let w;this.getAttributes=function(){return w===void 0&&C(this),w};let R=t.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return R===!1&&(R=n.getProgramParameter(y,Gg)),R},this.destroy=function(){i.releaseStatesOfProgram(this),n.deleteProgram(y),this.program=void 0},this.type=t.shaderType,this.name=t.shaderName,this.id=zg++,this.cacheKey=e,this.usedTimes=1,this.program=y,this.vertexShader=M,this.fragmentShader=E,this}let f0=0;class p0{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(e,t,i){const n=this._getShaderCacheForMaterial(e);return n.has(t)===!1&&(n.add(t),t.usedTimes++),n.has(i)===!1&&(n.add(i),i.usedTimes++),this}remove(e){const t=this.materialCache.get(e);for(const i of t)i.usedTimes--,i.usedTimes===0&&this.shaderCache.delete(i.code);return this.materialCache.delete(e),this}getVertexShaderStage(e){return this._getShaderStage(e.vertexShader)}getFragmentShaderStage(e){return this._getShaderStage(e.fragmentShader)}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(e){const t=this.materialCache;let i=t.get(e);return i===void 0&&(i=new Set,t.set(e,i)),i}_getShaderStage(e){const t=this.shaderCache;let i=t.get(e);return i===void 0&&(i=new _0(e),t.set(e,i)),i}}class _0{constructor(e){this.id=f0++,this.code=e,this.usedTimes=0}}function m0(r){return r===Pn||r===kr||r===Br}function g0(r,e,t,i,n,s){const a=new Du,o=new p0,l=new Set,c=[],h=new Map,d=i.logarithmicDepthBuffer;let u=i.precision;const f={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distance",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function m(g){return l.add(g),g===0?"uv":`uv${g}`}function y(g,w,R,P,O,B){const N=P.fog,H=O.geometry,J=g.isMeshStandardMaterial||g.isMeshLambertMaterial||g.isMeshPhongMaterial?P.environment:null,V=g.isMeshStandardMaterial||g.isMeshLambertMaterial&&!g.envMap||g.isMeshPhongMaterial&&!g.envMap,ne=e.get(g.envMap||J,V),q=ne&&ne.mapping===jr?ne.image.height:null,ee=f[g.type];g.precision!==null&&(u=i.getMaxPrecision(g.precision),u!==g.precision&&Re("WebGLProgram.getParameters:",g.precision,"not supported, using",u,"instead."));const ie=H.morphAttributes.position||H.morphAttributes.normal||H.morphAttributes.color,Ae=ie!==void 0?ie.length:0;let Te=0;H.morphAttributes.position!==void 0&&(Te=1),H.morphAttributes.normal!==void 0&&(Te=2),H.morphAttributes.color!==void 0&&(Te=3);let lt,qe,je,Y;if(ee){const ht=Ii[ee];lt=ht.vertexShader,qe=ht.fragmentShader}else{lt=g.vertexShader,qe=g.fragmentShader;const ht=o.getVertexShaderStage(g),Je=o.getFragmentShaderStage(g);o.update(g,ht,Je),je=ht.id,Y=Je.id}const Q=r.getRenderTarget(),xe=r.state.buffers.depth.getReversed(),Pe=O.isInstancedMesh===!0,me=O.isBatchedMesh===!0,Fe=!!g.map,Tt=!!g.matcap,Oe=!!ne,$e=!!g.aoMap,ct=!!g.lightMap,ke=!!g.bumpMap&&g.wireframe===!1,pt=!!g.normalMap,Rt=!!g.displacementMap,Gt=!!g.emissiveMap,mt=!!g.metalnessMap,St=!!g.roughnessMap,L=g.anisotropy>0,Nt=g.clearcoat>0,et=g.dispersion>0,b=g.retroreflectivity>0,x=g.iridescence>0,F=g.sheen>0,G=g.transmission>0,X=L&&!!g.anisotropyMap,se=Nt&&!!g.clearcoatMap,re=Nt&&!!g.clearcoatNormalMap,$=Nt&&!!g.clearcoatRoughnessMap,j=x&&!!g.iridescenceMap,ae=x&&!!g.iridescenceThicknessMap,Ee=F&&!!g.sheenColorMap,he=F&&!!g.sheenRoughnessMap,oe=!!g.specularMap,we=!!g.specularColorMap,Ce=!!g.specularIntensityMap,De=G&&!!g.transmissionMap,D=G&&!!g.thicknessMap,le=!!g.gradientMap,K=!!g.alphaMap,ce=g.alphaTest>0,pe=!!g.alphaHash,te=!!g.extensions;let be=Ni;g.toneMapped&&(Q===null||Q.isXRRenderTarget===!0)&&(be=r.toneMapping);const Se={shaderID:ee,shaderType:g.type,shaderName:g.name,vertexShader:lt,fragmentShader:qe,defines:g.defines,customVertexShaderID:je,customFragmentShaderID:Y,isRawShaderMaterial:g.isRawShaderMaterial===!0,glslVersion:g.glslVersion,precision:u,batching:me,batchingColor:me&&O._colorsTexture!==null,instancing:Pe,instancingColor:Pe&&O.instanceColor!==null,instancingMorph:Pe&&O.morphTexture!==null,outputColorSpace:Q===null?r.outputColorSpace:Q.isXRRenderTarget===!0?Q.texture.colorSpace:We.workingColorSpace,alphaToCoverage:!!g.alphaToCoverage,map:Fe,matcap:Tt,envMap:Oe,envMapMode:Oe&&ne.mapping,envMapCubeUVHeight:q,aoMap:$e,lightMap:ct,bumpMap:ke,normalMap:pt,displacementMap:Rt,emissiveMap:Gt,normalMapObjectSpace:pt&&g.normalMapType===Zd,normalMapTangentSpace:pt&&g.normalMapType===Hl,packedNormalMap:pt&&g.normalMapType===Hl&&m0(g.normalMap.format),metalnessMap:mt,roughnessMap:St,anisotropy:L,anisotropyMap:X,clearcoat:Nt,clearcoatMap:se,clearcoatNormalMap:re,clearcoatRoughnessMap:$,dispersion:et,retroreflection:b,iridescence:x,iridescenceMap:j,iridescenceThicknessMap:ae,sheen:F,sheenColorMap:Ee,sheenRoughnessMap:he,specularMap:oe,specularColorMap:we,specularIntensityMap:Ce,transmission:G,transmissionMap:De,thicknessMap:D,gradientMap:le,opaque:g.transparent===!1&&g.blending===Rs&&g.alphaToCoverage===!1,alphaMap:K,alphaTest:ce,alphaHash:pe,combine:g.combine,mapUv:Fe&&m(g.map.channel),aoMapUv:$e&&m(g.aoMap.channel),lightMapUv:ct&&m(g.lightMap.channel),bumpMapUv:ke&&m(g.bumpMap.channel),normalMapUv:pt&&m(g.normalMap.channel),displacementMapUv:Rt&&m(g.displacementMap.channel),emissiveMapUv:Gt&&m(g.emissiveMap.channel),metalnessMapUv:mt&&m(g.metalnessMap.channel),roughnessMapUv:St&&m(g.roughnessMap.channel),anisotropyMapUv:X&&m(g.anisotropyMap.channel),clearcoatMapUv:se&&m(g.clearcoatMap.channel),clearcoatNormalMapUv:re&&m(g.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:$&&m(g.clearcoatRoughnessMap.channel),iridescenceMapUv:j&&m(g.iridescenceMap.channel),iridescenceThicknessMapUv:ae&&m(g.iridescenceThicknessMap.channel),sheenColorMapUv:Ee&&m(g.sheenColorMap.channel),sheenRoughnessMapUv:he&&m(g.sheenRoughnessMap.channel),specularMapUv:oe&&m(g.specularMap.channel),specularColorMapUv:we&&m(g.specularColorMap.channel),specularIntensityMapUv:Ce&&m(g.specularIntensityMap.channel),transmissionMapUv:De&&m(g.transmissionMap.channel),thicknessMapUv:D&&m(g.thicknessMap.channel),alphaMapUv:K&&m(g.alphaMap.channel),vertexTangents:!!H.attributes.tangent&&(pt||L),vertexNormals:!!H.attributes.normal,vertexColors:g.vertexColors,vertexAlphas:g.vertexColors===!0&&!!H.attributes.color&&H.attributes.color.itemSize===4,pointsUvs:O.isPoints===!0&&!!H.attributes.uv&&(Fe||K),fog:!!N,useFog:g.fog===!0,fogExp2:!!N&&N.isFogExp2,flatShading:g.wireframe===!1&&(g.flatShading===!0||H.attributes.normal===void 0&&pt===!1&&(g.isMeshLambertMaterial||g.isMeshPhongMaterial||g.isMeshStandardMaterial||g.isMeshPhysicalMaterial)),sizeAttenuation:g.sizeAttenuation===!0,logarithmicDepthBuffer:d,reversedDepthBuffer:xe,skinning:O.isSkinnedMesh===!0,hasPositionAttribute:H.attributes.position!==void 0,morphTargets:H.morphAttributes.position!==void 0,morphNormals:H.morphAttributes.normal!==void 0,morphColors:H.morphAttributes.color!==void 0,morphTargetsCount:Ae,morphTextureStride:Te,numSunLights:w.sun.length,numDirLights:w.directional.length,numPointLights:w.point.length,numSpotLights:w.spot.length,numSpotLightMaps:w.spotLightMap.length,numRectAreaLights:w.rectArea.length,numHemiLights:w.hemi.length,numSunLightShadows:w.sunShadowMap.length,numDirLightShadows:w.directionalShadowMap.length,numPointLightShadows:w.pointShadowMap.length,numSpotLightShadows:w.spotShadowMap.length,numSpotLightShadowsWithMaps:w.numSpotLightShadowsWithMaps,numLightProbes:w.numLightProbes,numLightProbeGrids:B.length,numClippingPlanes:s.numPlanes,numClipIntersection:s.numIntersection,dithering:g.dithering,shadowMapEnabled:r.shadowMap.enabled&&R.length>0,shadowMapType:r.shadowMap.type,toneMapping:be,decodeVideoTexture:Fe&&g.map.isVideoTexture===!0&&We.getTransfer(g.map.colorSpace)===nt,decodeVideoTextureEmissive:Gt&&g.emissiveMap.isVideoTexture===!0&&We.getTransfer(g.emissiveMap.colorSpace)===nt,premultipliedAlpha:g.premultipliedAlpha,doubleSided:g.side===Yi,flipSided:g.side===qt,useDepthPacking:g.depthPacking>=0,depthPacking:g.depthPacking||0,index0AttributeName:g.index0AttributeName,extensionClipCullDistance:te&&g.extensions.clipCullDistance===!0&&t.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(te&&g.extensions.multiDraw===!0||me)&&t.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:t.has("KHR_parallel_shader_compile"),customProgramCacheKey:g.customProgramCacheKey()};return Se.vertexUv1s=l.has(1),Se.vertexUv2s=l.has(2),Se.vertexUv3s=l.has(3),l.clear(),Se}function p(g){const w=[];if(g.shaderID?w.push(g.shaderID):(w.push(g.customVertexShaderID),w.push(g.customFragmentShaderID)),g.defines!==void 0)for(const R in g.defines)w.push(R),w.push(g.defines[R]);return g.isRawShaderMaterial===!1&&(_(w,g),T(w,g),w.push(r.outputColorSpace)),w.push(g.customProgramCacheKey),w.join()}function _(g,w){g.push(w.precision),g.push(w.outputColorSpace),g.push(w.envMapMode),g.push(w.envMapCubeUVHeight),g.push(w.mapUv),g.push(w.alphaMapUv),g.push(w.lightMapUv),g.push(w.aoMapUv),g.push(w.bumpMapUv),g.push(w.normalMapUv),g.push(w.displacementMapUv),g.push(w.emissiveMapUv),g.push(w.metalnessMapUv),g.push(w.roughnessMapUv),g.push(w.anisotropyMapUv),g.push(w.clearcoatMapUv),g.push(w.clearcoatNormalMapUv),g.push(w.clearcoatRoughnessMapUv),g.push(w.iridescenceMapUv),g.push(w.iridescenceThicknessMapUv),g.push(w.sheenColorMapUv),g.push(w.sheenRoughnessMapUv),g.push(w.specularMapUv),g.push(w.specularColorMapUv),g.push(w.specularIntensityMapUv),g.push(w.transmissionMapUv),g.push(w.thicknessMapUv),g.push(w.combine),g.push(w.fogExp2),g.push(w.sizeAttenuation),g.push(w.morphTargetsCount),g.push(w.morphAttributeCount),g.push(w.numSunLights),g.push(w.numDirLights),g.push(w.numPointLights),g.push(w.numSpotLights),g.push(w.numSpotLightMaps),g.push(w.numHemiLights),g.push(w.numRectAreaLights),g.push(w.numSunLightShadows),g.push(w.numDirLightShadows),g.push(w.numPointLightShadows),g.push(w.numSpotLightShadows),g.push(w.numSpotLightShadowsWithMaps),g.push(w.numLightProbes),g.push(w.shadowMapType),g.push(w.toneMapping),g.push(w.numClippingPlanes),g.push(w.numClipIntersection),g.push(w.depthPacking)}function T(g,w){a.disableAll(),w.instancing&&a.enable(0),w.instancingColor&&a.enable(1),w.instancingMorph&&a.enable(2),w.matcap&&a.enable(3),w.envMap&&a.enable(4),w.normalMapObjectSpace&&a.enable(5),w.normalMapTangentSpace&&a.enable(6),w.clearcoat&&a.enable(7),w.iridescence&&a.enable(8),w.alphaTest&&a.enable(9),w.vertexColors&&a.enable(10),w.vertexAlphas&&a.enable(11),w.vertexUv1s&&a.enable(12),w.vertexUv2s&&a.enable(13),w.vertexUv3s&&a.enable(14),w.vertexTangents&&a.enable(15),w.anisotropy&&a.enable(16),w.alphaHash&&a.enable(17),w.batching&&a.enable(18),w.dispersion&&a.enable(19),w.retroreflection&&a.enable(24),w.batchingColor&&a.enable(20),w.gradientMap&&a.enable(21),w.packedNormalMap&&a.enable(22),w.vertexNormals&&a.enable(23),g.push(a.mask),a.disableAll(),w.fog&&a.enable(0),w.useFog&&a.enable(1),w.flatShading&&a.enable(2),w.logarithmicDepthBuffer&&a.enable(3),w.reversedDepthBuffer&&a.enable(4),w.skinning&&a.enable(5),w.morphTargets&&a.enable(6),w.morphNormals&&a.enable(7),w.morphColors&&a.enable(8),w.premultipliedAlpha&&a.enable(9),w.shadowMapEnabled&&a.enable(10),w.doubleSided&&a.enable(11),w.flipSided&&a.enable(12),w.useDepthPacking&&a.enable(13),w.dithering&&a.enable(14),w.transmission&&a.enable(15),w.sheen&&a.enable(16),w.opaque&&a.enable(17),w.pointsUvs&&a.enable(18),w.decodeVideoTexture&&a.enable(19),w.decodeVideoTextureEmissive&&a.enable(20),w.alphaToCoverage&&a.enable(21),w.numLightProbeGrids>0&&a.enable(22),w.hasPositionAttribute&&a.enable(23),g.push(a.mask)}function A(g){const w=f[g.type];let R;if(w){const P=Ii[w];R=Bf.clone(P.uniforms)}else R=g.uniforms;return R}function S(g,w){let R=h.get(w);return R!==void 0?++R.usedTimes:(R=new d0(r,w,g,n),c.push(R),h.set(w,R)),R}function M(g){if(--g.usedTimes===0){const w=c.indexOf(g);c[w]=c[c.length-1],c.pop(),h.delete(g.cacheKey),g.destroy()}}function E(g){o.remove(g)}function C(){o.dispose()}return{getParameters:y,getProgramCacheKey:p,getUniforms:A,acquireProgram:S,releaseProgram:M,releaseShaderCache:E,programs:c,dispose:C}}function x0(){let r=new WeakMap;function e(a){return r.has(a)}function t(a){let o=r.get(a);return o===void 0&&(o={},r.set(a,o)),o}function i(a){r.delete(a)}function n(a,o,l){r.get(a)[o]=l}function s(){r=new WeakMap}return{has:e,get:t,remove:i,update:n,dispose:s}}function y0(r,e){return r.groupOrder!==e.groupOrder?r.groupOrder-e.groupOrder:r.renderOrder!==e.renderOrder?r.renderOrder-e.renderOrder:r.material.id!==e.material.id?r.material.id-e.material.id:r.materialVariant!==e.materialVariant?r.materialVariant-e.materialVariant:r.z!==e.z?r.z-e.z:r.id-e.id}function Ac(r,e){return r.groupOrder!==e.groupOrder?r.groupOrder-e.groupOrder:r.renderOrder!==e.renderOrder?r.renderOrder-e.renderOrder:r.z!==e.z?e.z-r.z:r.id-e.id}function Cc(){const r=[];let e=0;const t=[],i=[],n=[];function s(){e=0,t.length=0,i.length=0,n.length=0}function a(u){let f=0;return u.isInstancedMesh&&(f+=2),u.isSkinnedMesh&&(f+=1),f}function o(u,f,m,y,p,_){let T=r[e];return T===void 0?(T={id:u.id,object:u,geometry:f,material:m,materialVariant:a(u),groupOrder:y,renderOrder:u.renderOrder,z:p,group:_},r[e]=T):(T.id=u.id,T.object=u,T.geometry=f,T.material=m,T.materialVariant=a(u),T.groupOrder=y,T.renderOrder=u.renderOrder,T.z=p,T.group=_),e++,T}function l(u,f,m,y,p,_,T){T.reversedDepth===!0&&(p=-p);const A=o(u,f,m,y,p,_);m.transmission>0?i.push(A):m.transparent===!0?n.push(A):t.push(A)}function c(u,f,m,y,p,_){const T=o(u,f,m,y,p,_);m.transmission>0?i.unshift(T):m.transparent===!0?n.unshift(T):t.unshift(T)}function h(u,f){t.length>1&&t.sort(u||y0),i.length>1&&i.sort(f||Ac),n.length>1&&n.sort(f||Ac)}function d(){for(let u=e,f=r.length;u<f;u++){const m=r[u];if(m.id===null)break;m.id=null,m.object=null,m.geometry=null,m.material=null,m.group=null}}return{opaque:t,transmissive:i,transparent:n,init:s,push:l,unshift:c,finish:d,sort:h}}function v0(){let r=new WeakMap;function e(i,n){const s=r.get(i);let a;return s===void 0?(a=new Cc,r.set(i,[a])):n>=s.length?(a=new Cc,s.push(a)):a=s[n],a}function t(){r=new WeakMap}return{get:e,dispose:t}}function S0(){const r={};return{get:function(e){if(r[e.id]!==void 0)return r[e.id];let t;switch(e.type){case"SunLight":case"DirectionalLight":t={direction:new z,color:new Xe};break;case"SpotLight":t={position:new z,direction:new z,color:new Xe,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":t={position:new z,color:new Xe,distance:0,decay:0};break;case"HemisphereLight":t={direction:new z,skyColor:new Xe,groundColor:new Xe};break;case"RectAreaLight":t={color:new Xe,position:new z,halfWidth:new z,halfHeight:new z};break}return r[e.id]=t,t}}}function M0(){const r={};return{get:function(e){if(r[e.id]!==void 0)return r[e.id];let t;switch(e.type){case"SunLight":case"DirectionalLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Ge};break;case"SpotLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Ge};break;case"PointLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new Ge,shadowCameraNear:1,shadowCameraFar:1e3};break}return r[e.id]=t,t}}}let E0=0;function w0(r,e){return(e.castShadow?2:0)-(r.castShadow?2:0)+(e.map?1:0)-(r.map?1:0)}function T0(r){const e=new S0,t=M0(),i={version:0,hash:{sunLength:-1,directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numSunShadows:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],sun:[],sunShadow:[],sunShadowMap:[],sunShadowMatrix:[],sunShadowCascade:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let c=0;c<9;c++)i.probe.push(new z);const n=new z,s=new wt,a=new wt;function o(c){let h=0,d=0,u=0;for(let O=0;O<9;O++)i.probe[O].set(0,0,0);let f=0,m=0,y=0,p=0,_=0,T=0,A=0,S=0,M=0,E=0,C=0,g=0,w=0,R=0;c.sort(w0);for(let O=0,B=c.length;O<B;O++){const N=c[O],H=N.color,J=N.intensity,V=N.distance;let ne=null;if(N.shadow&&N.shadow.map&&(N.shadow.map.texture.format===Pn?ne=N.shadow.map.texture:ne=N.shadow.map.depthTexture||N.shadow.map.texture),N.isAmbientLight)h+=H.r*J,d+=H.g*J,u+=H.b*J;else if(N.isLightProbe){for(let q=0;q<9;q++)i.probe[q].addScaledVector(N.sh.coefficients[q],J);R++}else if(N.isSunLight){const q=e.get(N);if(q.color.copy(N.color).multiplyScalar(N.intensity),N.castShadow){const ee=N.shadow,ie=t.get(N);ie.shadowIntensity=ee.intensity,ie.shadowBias=ee.bias,ie.shadowNormalBias=ee.normalBias,ie.shadowRadius=ee.radius,ie.shadowMapSize.copy(ee.mapSize).multiply(ee.getFrameExtents()),i.sunShadow[m]=ie,i.sunShadowMap[m]=ne;const Ae=ee.getViewportCount();for(let Te=0;Te<Ae;Te++)i.sunShadowMatrix[y+Te]=ee.getMatrix(Te),i.sunShadowCascade[y+Te]=ee._cascadeData[Te];y+=Ae,m++}i.sun[f]=q,f++}else if(N.isDirectionalLight){const q=e.get(N);if(q.color.copy(N.color).multiplyScalar(N.intensity),N.castShadow){const ee=N.shadow,ie=t.get(N);ie.shadowIntensity=ee.intensity,ie.shadowBias=ee.bias,ie.shadowNormalBias=ee.normalBias,ie.shadowRadius=ee.radius,ie.shadowMapSize=ee.mapSize,i.directionalShadow[p]=ie,i.directionalShadowMap[p]=ne,i.directionalShadowMatrix[p]=N.shadow.matrix,M++}i.directional[p]=q,p++}else if(N.isSpotLight){const q=e.get(N);q.position.setFromMatrixPosition(N.matrixWorld),q.color.copy(H).multiplyScalar(J),q.distance=V,q.coneCos=Math.cos(N.angle),q.penumbraCos=Math.cos(N.angle*(1-N.penumbra)),q.decay=N.decay,i.spot[T]=q;const ee=N.shadow;if(N.map&&(i.spotLightMap[g]=N.map,g++,ee.updateMatrices(N),N.castShadow&&w++),i.spotLightMatrix[T]=ee.matrix,N.castShadow){const ie=t.get(N);ie.shadowIntensity=ee.intensity,ie.shadowBias=ee.bias,ie.shadowNormalBias=ee.normalBias,ie.shadowRadius=ee.radius,ie.shadowMapSize=ee.mapSize,i.spotShadow[T]=ie,i.spotShadowMap[T]=ne,C++}T++}else if(N.isRectAreaLight){const q=e.get(N);q.color.copy(H).multiplyScalar(J),q.halfWidth.set(N.width*.5,0,0),q.halfHeight.set(0,N.height*.5,0),i.rectArea[A]=q,A++}else if(N.isPointLight){const q=e.get(N);if(q.color.copy(N.color).multiplyScalar(N.intensity),q.distance=N.distance,q.decay=N.decay,N.castShadow){const ee=N.shadow,ie=t.get(N);ie.shadowIntensity=ee.intensity,ie.shadowBias=ee.bias,ie.shadowNormalBias=ee.normalBias,ie.shadowRadius=ee.radius,ie.shadowMapSize=ee.mapSize,ie.shadowCameraNear=ee.camera.near,ie.shadowCameraFar=ee.camera.far,i.pointShadow[_]=ie,i.pointShadowMap[_]=ne,i.pointShadowMatrix[_]=N.shadow.matrix,E++}i.point[_]=q,_++}else if(N.isHemisphereLight){const q=e.get(N);q.skyColor.copy(N.color).multiplyScalar(J),q.groundColor.copy(N.groundColor).multiplyScalar(J),i.hemi[S]=q,S++}}A>0&&(r.has("OES_texture_float_linear")===!0?(i.rectAreaLTC1=ue.LTC_FLOAT_1,i.rectAreaLTC2=ue.LTC_FLOAT_2):(i.rectAreaLTC1=ue.LTC_HALF_1,i.rectAreaLTC2=ue.LTC_HALF_2)),i.ambient[0]=h,i.ambient[1]=d,i.ambient[2]=u;const P=i.hash;(P.sunLength!==f||P.directionalLength!==p||P.pointLength!==_||P.spotLength!==T||P.rectAreaLength!==A||P.hemiLength!==S||P.numSunShadows!==m||P.numDirectionalShadows!==M||P.numPointShadows!==E||P.numSpotShadows!==C||P.numSpotMaps!==g||P.numLightProbes!==R)&&(i.sun.length=f,i.directional.length=p,i.spot.length=T,i.rectArea.length=A,i.point.length=_,i.hemi.length=S,i.sunShadow.length=m,i.sunShadowMap.length=m,i.sunShadowMatrix.length=y,i.sunShadowCascade.length=y,i.directionalShadow.length=M,i.directionalShadowMap.length=M,i.directionalShadowMatrix.length=M,i.pointShadow.length=E,i.pointShadowMap.length=E,i.pointShadowMatrix.length=E,i.spotShadow.length=C,i.spotShadowMap.length=C,i.spotLightMatrix.length=C+g-w,i.spotLightMap.length=g,i.numSpotLightShadowsWithMaps=w,i.numLightProbes=R,P.sunLength=f,P.directionalLength=p,P.pointLength=_,P.spotLength=T,P.rectAreaLength=A,P.hemiLength=S,P.numSunShadows=m,P.numDirectionalShadows=M,P.numPointShadows=E,P.numSpotShadows=C,P.numSpotMaps=g,P.numLightProbes=R,i.version=E0++)}function l(c,h){let d=0,u=0,f=0,m=0,y=0,p=0;const _=h.matrixWorldInverse;for(let T=0,A=c.length;T<A;T++){const S=c[T];if(S.isSunLight){const M=i.sun[d];M.direction.setFromMatrixPosition(S.matrixWorld),M.direction.transformDirection(_),d++}else if(S.isDirectionalLight){const M=i.directional[u];M.direction.setFromMatrixPosition(S.matrixWorld),n.setFromMatrixPosition(S.target.matrixWorld),M.direction.sub(n),M.direction.transformDirection(_),u++}else if(S.isSpotLight){const M=i.spot[m];M.position.setFromMatrixPosition(S.matrixWorld),M.position.applyMatrix4(_),M.direction.setFromMatrixPosition(S.matrixWorld),n.setFromMatrixPosition(S.target.matrixWorld),M.direction.sub(n),M.direction.transformDirection(_),m++}else if(S.isRectAreaLight){const M=i.rectArea[y];M.position.setFromMatrixPosition(S.matrixWorld),M.position.applyMatrix4(_),a.identity(),s.copy(S.matrixWorld),s.premultiply(_),a.extractRotation(s),M.halfWidth.set(S.width*.5,0,0),M.halfHeight.set(0,S.height*.5,0),M.halfWidth.applyMatrix4(a),M.halfHeight.applyMatrix4(a),y++}else if(S.isPointLight){const M=i.point[f];M.position.setFromMatrixPosition(S.matrixWorld),M.position.applyMatrix4(_),f++}else if(S.isHemisphereLight){const M=i.hemi[p];M.direction.setFromMatrixPosition(S.matrixWorld),M.direction.transformDirection(_),p++}}}return{setup:o,setupView:l,state:i}}function Rc(r){const e=new T0(r),t=[],i=[],n=[];function s(u){d.camera=u,t.length=0,i.length=0,n.length=0}function a(u){t.push(u)}function o(u){i.push(u)}function l(u){n.push(u)}function c(){e.setup(t)}function h(u){e.setupView(t,u)}const d={lightsArray:t,shadowsArray:i,lightProbeGridArray:n,camera:null,lights:e,transmissionRenderTarget:{},textureUnits:0};return{init:s,state:d,setupLights:c,setupLightsView:h,pushLight:a,pushShadow:o,pushLightProbeGrid:l}}function b0(r){let e=new WeakMap;function t(n,s=0){const a=e.get(n);let o;return a===void 0?(o=new Rc(r),e.set(n,[o])):s>=a.length?(o=new Rc(r),a.push(o)):o=a[s],o}function i(){e=new WeakMap}return{get:t,dispose:i}}const A0=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,C0=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ).rg;
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ).r;
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( max( 0.0, squared_mean - mean * mean ) );
	gl_FragColor = vec4( mean, std_dev, 0.0, 1.0 );
}`,R0=[new z(1,0,0),new z(-1,0,0),new z(0,1,0),new z(0,-1,0),new z(0,0,1),new z(0,0,-1)],P0=[new z(0,-1,0),new z(0,-1,0),new z(0,0,1),new z(0,0,-1),new z(0,-1,0),new z(0,-1,0)],Pc=new wt,ps=new z,Ba=new z;function I0(r,e,t){let i=new ku;const n=new Ge,s=new Ge,a=new xt,o=new Wf,l=new Vf,c={},h=t.maxTextureSize,d={[Cn]:qt,[qt]:Cn,[Yi]:Yi},u=new Si({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new Ge},radius:{value:4}},vertexShader:A0,fragmentShader:C0}),f=u.clone();f.defines.HORIZONTAL_PASS=1;const m=new en;m.setAttribute("position",new Ji(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));const y=new Ui(m,u),p=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=Pr;let _=this.type;this.render=function(E,C,g){if(p.enabled===!1||p.autoUpdate===!1&&p.needsUpdate===!1||E.length===0)return;this.type===Rd&&(Re("WebGLShadowMap: PCFSoftShadowMap has been removed. Using PCFShadowMap instead."),this.type=Pr);const w=r.getRenderTarget(),R=r.getActiveCubeFace(),P=r.getActiveMipmapLevel(),O=r.state;O.setBlending(Ki),O.buffers.depth.getReversed()===!0?O.buffers.color.setClear(0,0,0,0):O.buffers.color.setClear(1,1,1,1),O.buffers.depth.setTest(!0),O.setScissorTest(!1);const B=_!==this.type;B&&C.traverse(function(N){N.material&&(Array.isArray(N.material)?N.material.forEach(H=>H.needsUpdate=!0):N.material.needsUpdate=!0)});for(let N=0,H=E.length;N<H;N++){const J=E[N],V=J.shadow;if(V===void 0){Re("WebGLShadowMap:",J,"has no shadow.");continue}if(V.autoUpdate===!1&&V.needsUpdate===!1)continue;n.copy(V.mapSize);const ne=V.getFrameExtents();n.multiply(ne),s.copy(V.mapSize),(n.x>h||n.y>h)&&(n.x>h&&(s.x=Math.floor(h/ne.x),n.x=s.x*ne.x,V.mapSize.x=s.x),n.y>h&&(s.y=Math.floor(h/ne.y),n.y=s.y*ne.y,V.mapSize.y=s.y));const q=r.state.buffers.depth.getReversed();if(V.camera._reversedDepth=q,V.map===null||B===!0){if(V.map!==null&&(V.map.depthTexture!==null&&(V.map.depthTexture.dispose(),V.map.depthTexture=null),V.map.dispose()),this.type===ws){if(J.isPointLight){Re("WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.");continue}V.map=new vi(n.x,n.y,{format:Pn,type:Oi,minFilter:Dt,magFilter:Dt,generateMipmaps:!1}),V.map.texture.name=J.name+".shadowMap",V.map.depthTexture=new Ns(n.x,n.y,Di),V.map.depthTexture.name=J.name+".shadowMapDepth",V.map.depthTexture.format=Qi,V.map.depthTexture.compareFunction=null,V.map.depthTexture.minFilter=bt,V.map.depthTexture.magFilter=bt}else J.isPointLight?(V.map=new Xu(n.x),V.map.depthTexture=new Uf(n.x,Fi)):(V.map=new vi(n.x,n.y),V.map.depthTexture=new Ns(n.x,n.y,Fi)),V.map.depthTexture.name=J.name+".shadowMap",V.map.depthTexture.format=Qi,this.type===Pr?(V.map.depthTexture.compareFunction=q?nl:il,V.map.depthTexture.minFilter=Dt,V.map.depthTexture.magFilter=Dt):(V.map.depthTexture.compareFunction=null,V.map.depthTexture.minFilter=bt,V.map.depthTexture.magFilter=bt);V.camera.updateProjectionMatrix()}V.map.isWebGLCubeRenderTarget!==!0&&(V.map.width!==n.x||V.map.height!==n.y)&&V.map.setSize(n.x,n.y);const ee=V.map.isWebGLCubeRenderTarget?6:V.getViewportCount();J.isPointLight!==!0&&V.updateMatrices(J,g);for(let ie=0;ie<ee;ie++){const Ae=V.getCamera(ie);if(J.isPointLight){const Te=V.camera,lt=V.matrix,qe=J.distance||Te.far;qe!==Te.far&&(Te.far=qe,Te.updateProjectionMatrix()),ps.setFromMatrixPosition(J.matrixWorld),Te.position.copy(ps),Ba.copy(Te.position),Ba.add(R0[ie]),Te.up.copy(P0[ie]),Te.lookAt(Ba),Te.updateMatrixWorld(),lt.makeTranslation(-ps.x,-ps.y,-ps.z),Pc.multiplyMatrices(Te.projectionMatrix,Te.matrixWorldInverse),V._frustum.setFromProjectionMatrix(Pc,Te.coordinateSystem,Te.reversedDepth)}if(V.map.isWebGLCubeRenderTarget)r.setRenderTarget(V.map,ie),r.clear();else{ie===0&&(r.setRenderTarget(V.map),r.clear());const Te=V.getViewport(ie);a.set(s.x*Te.x,s.y*Te.y,s.x*Te.z,s.y*Te.w),O.viewport(a)}i=V.getFrustum(ie),S(C,g,Ae,J,this.type)}V.isPointLightShadow!==!0&&this.type===ws&&T(V,g),V.needsUpdate=!1}_=this.type,p.needsUpdate=!1,r.setRenderTarget(w,R,P)};function T(E,C){const g=e.update(y);u.defines.VSM_SAMPLES!==E.blurSamples&&(u.defines.VSM_SAMPLES=E.blurSamples,f.defines.VSM_SAMPLES=E.blurSamples,u.needsUpdate=!0,f.needsUpdate=!0),E.mapPass===null?E.mapPass=new vi(n.x,n.y,{format:Pn,type:Oi}):(E.mapPass.width!==E.map.width||E.mapPass.height!==E.map.height)&&E.mapPass.setSize(E.map.width,E.map.height),u.uniforms.shadow_pass.value=E.map.depthTexture,u.uniforms.resolution.value.set(E.map.width,E.map.height),u.uniforms.radius.value=E.radius,r.setRenderTarget(E.mapPass),r.clear(),r.renderBufferDirect(C,null,g,u,y,null),f.uniforms.shadow_pass.value=E.mapPass.texture,f.uniforms.resolution.value.set(E.map.width,E.map.height),f.uniforms.radius.value=E.radius,r.setRenderTarget(E.map),r.clear(),r.renderBufferDirect(C,null,g,f,y,null)}function A(E,C,g,w){let R=null;const P=g.isPointLight===!0?E.customDistanceMaterial:E.customDepthMaterial;if(P!==void 0)R=P;else if(R=g.isPointLight===!0?l:o,r.localClippingEnabled&&C.clipShadows===!0&&Array.isArray(C.clippingPlanes)&&C.clippingPlanes.length!==0||C.displacementMap&&C.displacementScale!==0||C.alphaMap&&C.alphaTest>0||C.map&&C.alphaTest>0||C.alphaToCoverage===!0){const O=R.uuid,B=C.uuid;let N=c[O];N===void 0&&(N={},c[O]=N);let H=N[B];H===void 0&&(H=R.clone(),N[B]=H,C.addEventListener("dispose",M)),R=H}if(R.visible=C.visible,R.wireframe=C.wireframe,w===ws?R.side=C.shadowSide!==null?C.shadowSide:C.side:R.side=C.shadowSide!==null?C.shadowSide:d[C.side],R.alphaMap=C.alphaMap,R.alphaTest=C.alphaToCoverage===!0?.5:C.alphaTest,R.map=C.map,R.clipShadows=C.clipShadows,R.clippingPlanes=C.clippingPlanes,R.clipIntersection=C.clipIntersection,R.displacementMap=C.displacementMap,R.displacementScale=C.displacementScale,R.displacementBias=C.displacementBias,R.wireframeLinewidth=C.wireframeLinewidth,R.linewidth=C.linewidth,g.isPointLight===!0&&R.isMeshDistanceMaterial===!0){const O=r.properties.get(R);O.light=g}return R}function S(E,C,g,w,R){if(E.visible===!1)return;if(E.layers.test(C.layers)&&(E.isMesh||E.isLine||E.isPoints)&&(E.castShadow||E.receiveShadow&&R===ws)&&(!E.frustumCulled||E.intersectsFrustum(i))){E.modelViewMatrix.multiplyMatrices(g.matrixWorldInverse,E.matrixWorld);const B=e.update(E),N=E.material;if(Array.isArray(N)){const H=B.groups;for(let J=0,V=H.length;J<V;J++){const ne=H[J],q=N[ne.materialIndex];if(q&&q.visible){const ee=A(E,q,w,R);E.onBeforeShadow(r,E,C,g,B,ee,ne),r.renderBufferDirect(g,null,B,ee,E,ne),E.onAfterShadow(r,E,C,g,B,ee,ne)}}}else if(N.visible){const H=A(E,N,w,R);E.onBeforeShadow(r,E,C,g,B,H,null),r.renderBufferDirect(g,null,B,H,E,null),E.onAfterShadow(r,E,C,g,B,H,null)}}const O=E.children;for(let B=0,N=O.length;B<N;B++)S(O[B],C,g,w,R)}function M(E){E.target.removeEventListener("dispose",M);for(const g in c){const w=c[g],R=E.target.uuid;R in w&&(w[R].dispose(),delete w[R])}}}function D0(r,e){function t(){let D=!1;const le=new xt;let K=null;const ce=new xt(0,0,0,0);return{setMask:function(pe){K!==pe&&!D&&(r.colorMask(pe,pe,pe,pe),K=pe)},setLocked:function(pe){D=pe},setClear:function(pe,te,be,Se,ht){ht===!0&&(pe*=Se,te*=Se,be*=Se),le.set(pe,te,be,Se),ce.equals(le)===!1&&(r.clearColor(pe,te,be,Se),ce.copy(le))},reset:function(){D=!1,K=null,ce.set(-1,0,0,0)}}}function i(){let D=!1,le=!1,K=null,ce=null,pe=null;return{setReversed:function(te){if(le!==te){const be=e.get("EXT_clip_control");te?be.clipControlEXT(be.LOWER_LEFT_EXT,be.ZERO_TO_ONE_EXT):be.clipControlEXT(be.LOWER_LEFT_EXT,be.NEGATIVE_ONE_TO_ONE_EXT),le=te;const Se=pe;pe=null,this.setClear(Se)}},getReversed:function(){return le},setTest:function(te){te?Q(r.DEPTH_TEST):xe(r.DEPTH_TEST)},setMask:function(te){K!==te&&!D&&(r.depthMask(te),K=te)},setFunc:function(te){if(le&&(te=uf[te]),ce!==te){switch(te){case ao:r.depthFunc(r.NEVER);break;case oo:r.depthFunc(r.ALWAYS);break;case lo:r.depthFunc(r.LESS);break;case Is:r.depthFunc(r.LEQUAL);break;case co:r.depthFunc(r.EQUAL);break;case ho:r.depthFunc(r.GEQUAL);break;case uo:r.depthFunc(r.GREATER);break;case fo:r.depthFunc(r.NOTEQUAL);break;default:r.depthFunc(r.LEQUAL)}ce=te}},setLocked:function(te){D=te},setClear:function(te){pe!==te&&(pe=te,le&&(te=1-te),r.clearDepth(te))},reset:function(){D=!1,K=null,ce=null,pe=null,le=!1}}}function n(){let D=!1,le=null,K=null,ce=null,pe=null,te=null,be=null,Se=null,ht=null;return{setTest:function(Je){D||(Je?Q(r.STENCIL_TEST):xe(r.STENCIL_TEST))},setMask:function(Je){le!==Je&&!D&&(r.stencilMask(Je),le=Je)},setFunc:function(Je,hi,Mi){(K!==Je||ce!==hi||pe!==Mi)&&(r.stencilFunc(Je,hi,Mi),K=Je,ce=hi,pe=Mi)},setOp:function(Je,hi,Mi){(te!==Je||be!==hi||Se!==Mi)&&(r.stencilOp(Je,hi,Mi),te=Je,be=hi,Se=Mi)},setLocked:function(Je){D=Je},setClear:function(Je){ht!==Je&&(r.clearStencil(Je),ht=Je)},reset:function(){D=!1,le=null,K=null,ce=null,pe=null,te=null,be=null,Se=null,ht=null}}}const s=new t,a=new i,o=new n,l=new WeakMap,c=new WeakMap;let h={},d={},u={},f=new WeakMap,m=[],y=null,p=!1,_=null,T=null,A=null,S=null,M=null,E=null,C=null,g=new Xe(0,0,0),w=0,R=!1,P=null,O=null,B=null,N=null,H=null;const J=r.getParameter(r.MAX_COMBINED_TEXTURE_IMAGE_UNITS);let V=!1,ne=0;const q=r.getParameter(r.VERSION);q.indexOf("WebGL")!==-1?(ne=parseFloat(/^WebGL (\d)/.exec(q)[1]),V=ne>=1):q.indexOf("OpenGL ES")!==-1&&(ne=parseFloat(/^OpenGL ES (\d)/.exec(q)[1]),V=ne>=2);let ee=null,ie={};const Ae=r.getParameter(r.SCISSOR_BOX),Te=r.getParameter(r.VIEWPORT),lt=new xt().fromArray(Ae),qe=new xt().fromArray(Te);function je(D,le,K,ce){const pe=new Uint8Array(4),te=r.createTexture();r.bindTexture(D,te),r.texParameteri(D,r.TEXTURE_MIN_FILTER,r.NEAREST),r.texParameteri(D,r.TEXTURE_MAG_FILTER,r.NEAREST);for(let be=0;be<K;be++)D===r.TEXTURE_3D||D===r.TEXTURE_2D_ARRAY?r.texImage3D(le,0,r.RGBA,1,1,ce,0,r.RGBA,r.UNSIGNED_BYTE,pe):r.texImage2D(le+be,0,r.RGBA,1,1,0,r.RGBA,r.UNSIGNED_BYTE,pe);return te}const Y={};Y[r.TEXTURE_2D]=je(r.TEXTURE_2D,r.TEXTURE_2D,1),Y[r.TEXTURE_CUBE_MAP]=je(r.TEXTURE_CUBE_MAP,r.TEXTURE_CUBE_MAP_POSITIVE_X,6),Y[r.TEXTURE_2D_ARRAY]=je(r.TEXTURE_2D_ARRAY,r.TEXTURE_2D_ARRAY,1,1),Y[r.TEXTURE_3D]=je(r.TEXTURE_3D,r.TEXTURE_3D,1,1),s.setClear(0,0,0,1),a.setClear(1),o.setClear(0),Q(r.DEPTH_TEST),a.setFunc(Is),ke(!1),pt(Ol),Q(r.CULL_FACE),$e(Ki);function Q(D){h[D]!==!0&&(r.enable(D),h[D]=!0)}function xe(D){h[D]!==!1&&(r.disable(D),h[D]=!1)}function Pe(D,le){return u[D]!==le?(r.bindFramebuffer(D,le),u[D]=le,D===r.DRAW_FRAMEBUFFER&&(u[r.FRAMEBUFFER]=le),D===r.FRAMEBUFFER&&(u[r.DRAW_FRAMEBUFFER]=le),!0):!1}function me(D,le){let K=m,ce=!1;if(D){K=f.get(le),K===void 0&&(K=[],f.set(le,K));const pe=D.textures;if(K.length!==pe.length||K[0]!==r.COLOR_ATTACHMENT0){for(let te=0,be=pe.length;te<be;te++)K[te]=r.COLOR_ATTACHMENT0+te;K.length=pe.length,ce=!0}}else K[0]!==r.BACK&&(K[0]=r.BACK,ce=!0);ce&&r.drawBuffers(K)}function Fe(D){return y!==D?(r.useProgram(D),y=D,!0):!1}const Tt={[Jn]:r.FUNC_ADD,[Id]:r.FUNC_SUBTRACT,[Dd]:r.FUNC_REVERSE_SUBTRACT};Tt[Ld]=r.MIN,Tt[Nd]=r.MAX;const Oe={[Fd]:r.ZERO,[Od]:r.ONE,[Ud]:r.SRC_COLOR,[du]:r.SRC_ALPHA,[Wd]:r.SRC_ALPHA_SATURATE,[Gd]:r.DST_COLOR,[Bd]:r.DST_ALPHA,[kd]:r.ONE_MINUS_SRC_COLOR,[fu]:r.ONE_MINUS_SRC_ALPHA,[zd]:r.ONE_MINUS_DST_COLOR,[Hd]:r.ONE_MINUS_DST_ALPHA,[Vd]:r.CONSTANT_COLOR,[Xd]:r.ONE_MINUS_CONSTANT_COLOR,[qd]:r.CONSTANT_ALPHA,[Yd]:r.ONE_MINUS_CONSTANT_ALPHA};function $e(D,le,K,ce,pe,te,be,Se,ht,Je){if(D===Ki){p===!0&&(xe(r.BLEND),p=!1);return}if(p===!1&&(Q(r.BLEND),p=!0),D!==Pd){if(D!==_||Je!==R){if((T!==Jn||M!==Jn)&&(r.blendEquation(r.FUNC_ADD),T=Jn,M=Jn),Je)switch(D){case Rs:r.blendFuncSeparate(r.ONE,r.ONE_MINUS_SRC_ALPHA,r.ONE,r.ONE_MINUS_SRC_ALPHA);break;case Ul:r.blendFunc(r.ONE,r.ONE);break;case kl:r.blendFuncSeparate(r.ZERO,r.ONE_MINUS_SRC_COLOR,r.ZERO,r.ONE);break;case Bl:r.blendFuncSeparate(r.DST_COLOR,r.ONE_MINUS_SRC_ALPHA,r.ZERO,r.ONE);break;default:Ke("WebGLState: Invalid blending: ",D);break}else switch(D){case Rs:r.blendFuncSeparate(r.SRC_ALPHA,r.ONE_MINUS_SRC_ALPHA,r.ONE,r.ONE_MINUS_SRC_ALPHA);break;case Ul:r.blendFuncSeparate(r.SRC_ALPHA,r.ONE,r.ONE,r.ONE);break;case kl:Ke("WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case Bl:Ke("WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:Ke("WebGLState: Invalid blending: ",D);break}A=null,S=null,E=null,C=null,g.set(0,0,0),w=0,_=D,R=Je}return}pe=pe||le,te=te||K,be=be||ce,(le!==T||pe!==M)&&(r.blendEquationSeparate(Tt[le],Tt[pe]),T=le,M=pe),(K!==A||ce!==S||te!==E||be!==C)&&(r.blendFuncSeparate(Oe[K],Oe[ce],Oe[te],Oe[be]),A=K,S=ce,E=te,C=be),(Se.equals(g)===!1||ht!==w)&&(r.blendColor(Se.r,Se.g,Se.b,ht),g.copy(Se),w=ht),_=D,R=!1}function ct(D,le){D.side===Yi?xe(r.CULL_FACE):Q(r.CULL_FACE);let K=D.side===qt;le&&(K=!K),ke(K),D.blending===Rs&&D.transparent===!1?$e(Ki):$e(D.blending,D.blendEquation,D.blendSrc,D.blendDst,D.blendEquationAlpha,D.blendSrcAlpha,D.blendDstAlpha,D.blendColor,D.blendAlpha,D.premultipliedAlpha),a.setFunc(D.depthFunc),a.setTest(D.depthTest),a.setMask(D.depthWrite),s.setMask(D.colorWrite);const ce=D.stencilWrite;o.setTest(ce),ce&&(o.setMask(D.stencilWriteMask),o.setFunc(D.stencilFunc,D.stencilRef,D.stencilFuncMask),o.setOp(D.stencilFail,D.stencilZFail,D.stencilZPass)),Gt(D.polygonOffset,D.polygonOffsetFactor,D.polygonOffsetUnits),D.alphaToCoverage===!0?Q(r.SAMPLE_ALPHA_TO_COVERAGE):xe(r.SAMPLE_ALPHA_TO_COVERAGE)}function ke(D){P!==D&&(D?r.frontFace(r.CW):r.frontFace(r.CCW),P=D)}function pt(D){D!==Ad?(Q(r.CULL_FACE),D!==O&&(D===Ol?r.cullFace(r.BACK):D===Cd?r.cullFace(r.FRONT):r.cullFace(r.FRONT_AND_BACK))):xe(r.CULL_FACE),O=D}function Rt(D){D!==B&&(V&&r.lineWidth(D),B=D)}function Gt(D,le,K){D?(Q(r.POLYGON_OFFSET_FILL),(N!==le||H!==K)&&(N=le,H=K,a.getReversed()&&(le=-le),r.polygonOffset(le,K))):xe(r.POLYGON_OFFSET_FILL)}function mt(D){D?Q(r.SCISSOR_TEST):xe(r.SCISSOR_TEST)}function St(D){D===void 0&&(D=r.TEXTURE0+J-1),ee!==D&&(r.activeTexture(D),ee=D)}function L(D,le,K){K===void 0&&(ee===null?K=r.TEXTURE0+J-1:K=ee);let ce=ie[K];ce===void 0&&(ce={type:void 0,texture:void 0},ie[K]=ce),(ce.type!==D||ce.texture!==le)&&(ee!==K&&(r.activeTexture(K),ee=K),r.bindTexture(D,le||Y[D]),ce.type=D,ce.texture=le)}function Nt(){const D=ie[ee];D!==void 0&&D.type!==void 0&&(r.bindTexture(D.type,null),D.type=void 0,D.texture=void 0)}function et(){try{r.compressedTexImage2D(...arguments)}catch(D){Ke("WebGLState:",D)}}function b(){try{r.compressedTexImage3D(...arguments)}catch(D){Ke("WebGLState:",D)}}function x(){try{r.texSubImage2D(...arguments)}catch(D){Ke("WebGLState:",D)}}function F(){try{r.texSubImage3D(...arguments)}catch(D){Ke("WebGLState:",D)}}function G(){try{r.compressedTexSubImage2D(...arguments)}catch(D){Ke("WebGLState:",D)}}function X(){try{r.compressedTexSubImage3D(...arguments)}catch(D){Ke("WebGLState:",D)}}function se(){try{r.texStorage2D(...arguments)}catch(D){Ke("WebGLState:",D)}}function re(){try{r.texStorage3D(...arguments)}catch(D){Ke("WebGLState:",D)}}function $(){try{r.texImage2D(...arguments)}catch(D){Ke("WebGLState:",D)}}function j(){try{r.texImage3D(...arguments)}catch(D){Ke("WebGLState:",D)}}function ae(D){return d[D]!==void 0?d[D]:r.getParameter(D)}function Ee(D,le){d[D]!==le&&(r.pixelStorei(D,le),d[D]=le)}function he(D){lt.equals(D)===!1&&(r.scissor(D.x,D.y,D.z,D.w),lt.copy(D))}function oe(D){qe.equals(D)===!1&&(r.viewport(D.x,D.y,D.z,D.w),qe.copy(D))}function we(D,le){let K=c.get(le);K===void 0&&(K=new WeakMap,c.set(le,K));let ce=K.get(D);ce===void 0&&(ce=r.getUniformBlockIndex(le,D.name),K.set(D,ce))}function Ce(D,le){const ce=c.get(le).get(D);l.get(le)!==ce&&(r.uniformBlockBinding(le,ce,D.__bindingPointIndex),l.set(le,ce))}function De(){r.disable(r.BLEND),r.disable(r.CULL_FACE),r.disable(r.DEPTH_TEST),r.disable(r.POLYGON_OFFSET_FILL),r.disable(r.SCISSOR_TEST),r.disable(r.STENCIL_TEST),r.disable(r.SAMPLE_ALPHA_TO_COVERAGE),r.blendEquation(r.FUNC_ADD),r.blendFunc(r.ONE,r.ZERO),r.blendFuncSeparate(r.ONE,r.ZERO,r.ONE,r.ZERO),r.blendColor(0,0,0,0),r.colorMask(!0,!0,!0,!0),r.clearColor(0,0,0,0),r.depthMask(!0),r.depthFunc(r.LESS),a.setReversed(!1),r.clearDepth(1),r.stencilMask(4294967295),r.stencilFunc(r.ALWAYS,0,4294967295),r.stencilOp(r.KEEP,r.KEEP,r.KEEP),r.clearStencil(0),r.cullFace(r.BACK),r.frontFace(r.CCW),r.polygonOffset(0,0),r.activeTexture(r.TEXTURE0),r.bindFramebuffer(r.FRAMEBUFFER,null),r.bindFramebuffer(r.DRAW_FRAMEBUFFER,null),r.bindFramebuffer(r.READ_FRAMEBUFFER,null),r.useProgram(null),r.lineWidth(1),r.scissor(0,0,r.canvas.width,r.canvas.height),r.viewport(0,0,r.canvas.width,r.canvas.height),r.pixelStorei(r.PACK_ALIGNMENT,4),r.pixelStorei(r.UNPACK_ALIGNMENT,4),r.pixelStorei(r.UNPACK_FLIP_Y_WEBGL,!1),r.pixelStorei(r.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),r.pixelStorei(r.UNPACK_COLORSPACE_CONVERSION_WEBGL,r.BROWSER_DEFAULT_WEBGL),r.pixelStorei(r.PACK_ROW_LENGTH,0),r.pixelStorei(r.PACK_SKIP_PIXELS,0),r.pixelStorei(r.PACK_SKIP_ROWS,0),r.pixelStorei(r.UNPACK_ROW_LENGTH,0),r.pixelStorei(r.UNPACK_IMAGE_HEIGHT,0),r.pixelStorei(r.UNPACK_SKIP_PIXELS,0),r.pixelStorei(r.UNPACK_SKIP_ROWS,0),r.pixelStorei(r.UNPACK_SKIP_IMAGES,0),h={},d={},ee=null,ie={},u={},f=new WeakMap,m=[],y=null,p=!1,_=null,T=null,A=null,S=null,M=null,E=null,C=null,g=new Xe(0,0,0),w=0,R=!1,P=null,O=null,B=null,N=null,H=null,lt.set(0,0,r.canvas.width,r.canvas.height),qe.set(0,0,r.canvas.width,r.canvas.height),s.reset(),a.reset(),o.reset()}return{buffers:{color:s,depth:a,stencil:o},enable:Q,disable:xe,bindFramebuffer:Pe,drawBuffers:me,useProgram:Fe,setBlending:$e,setMaterial:ct,setFlipSided:ke,setCullFace:pt,setLineWidth:Rt,setPolygonOffset:Gt,setScissorTest:mt,activeTexture:St,bindTexture:L,unbindTexture:Nt,compressedTexImage2D:et,compressedTexImage3D:b,texImage2D:$,texImage3D:j,pixelStorei:Ee,getParameter:ae,updateUBOMapping:we,uniformBlockBinding:Ce,texStorage2D:se,texStorage3D:re,texSubImage2D:x,texSubImage3D:F,compressedTexSubImage2D:G,compressedTexSubImage3D:X,scissor:he,viewport:oe,reset:De}}function L0(r,e,t,i,n,s,a){const o=e.has("WEBGL_multisampled_render_to_texture")?e.get("WEBGL_multisampled_render_to_texture"):null,l=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),c=new Ge,h=new WeakMap,d=new Set;let u;const f=new WeakMap;let m=!1;try{m=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function y(b,x){return m?new OffscreenCanvas(b,x):Wr("canvas")}function p(b,x,F){let G=1;const X=et(b);if((X.width>F||X.height>F)&&(G=F/Math.max(X.width,X.height)),G<1)if(typeof HTMLImageElement<"u"&&b instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&b instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&b instanceof ImageBitmap||typeof VideoFrame<"u"&&b instanceof VideoFrame){const se=Math.floor(G*X.width),re=Math.floor(G*X.height);u===void 0&&(u=y(se,re));const $=x?y(se,re):u;return $.width=se,$.height=re,$.getContext("2d").drawImage(b,0,0,se,re),Re("WebGLRenderer: Texture has been resized from ("+X.width+"x"+X.height+") to ("+se+"x"+re+")."),$}else return"data"in b&&Re("WebGLRenderer: Image in DataTexture is too big ("+X.width+"x"+X.height+")."),b;return b}function _(b){return b.generateMipmaps}function T(b){r.generateMipmap(b)}function A(b){return b.isWebGLCubeRenderTarget?r.TEXTURE_CUBE_MAP:b.isWebGL3DRenderTarget?r.TEXTURE_3D:b.isWebGLArrayRenderTarget||b.isCompressedArrayTexture?r.TEXTURE_2D_ARRAY:r.TEXTURE_2D}function S(b,x,F,G,X,se=!1){if(b!==null){if(r[b]!==void 0)return r[b];Re("WebGLRenderer: Attempt to use non-existing WebGL internal format '"+b+"'")}let re;G&&(re=e.get("EXT_texture_norm16"),re||Re("WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension"));let $=x;if(x===r.RED&&(F===r.FLOAT&&($=r.R32F),F===r.HALF_FLOAT&&($=r.R16F),F===r.UNSIGNED_BYTE&&($=r.R8),F===r.UNSIGNED_SHORT&&re&&($=re.R16_EXT),F===r.SHORT&&re&&($=re.R16_SNORM_EXT)),x===r.RED_INTEGER&&(F===r.UNSIGNED_BYTE&&($=r.R8UI),F===r.UNSIGNED_SHORT&&($=r.R16UI),F===r.UNSIGNED_INT&&($=r.R32UI),F===r.BYTE&&($=r.R8I),F===r.SHORT&&($=r.R16I),F===r.INT&&($=r.R32I)),x===r.RG&&(F===r.FLOAT&&($=r.RG32F),F===r.HALF_FLOAT&&($=r.RG16F),F===r.UNSIGNED_BYTE&&($=r.RG8),F===r.UNSIGNED_SHORT&&re&&($=re.RG16_EXT),F===r.SHORT&&re&&($=re.RG16_SNORM_EXT)),x===r.RG_INTEGER&&(F===r.UNSIGNED_BYTE&&($=r.RG8UI),F===r.UNSIGNED_SHORT&&($=r.RG16UI),F===r.UNSIGNED_INT&&($=r.RG32UI),F===r.BYTE&&($=r.RG8I),F===r.SHORT&&($=r.RG16I),F===r.INT&&($=r.RG32I)),x===r.RGB_INTEGER&&(F===r.UNSIGNED_BYTE&&($=r.RGB8UI),F===r.UNSIGNED_SHORT&&($=r.RGB16UI),F===r.UNSIGNED_INT&&($=r.RGB32UI),F===r.BYTE&&($=r.RGB8I),F===r.SHORT&&($=r.RGB16I),F===r.INT&&($=r.RGB32I)),x===r.RGBA_INTEGER&&(F===r.UNSIGNED_BYTE&&($=r.RGBA8UI),F===r.UNSIGNED_SHORT&&($=r.RGBA16UI),F===r.UNSIGNED_INT&&($=r.RGBA32UI),F===r.BYTE&&($=r.RGBA8I),F===r.SHORT&&($=r.RGBA16I),F===r.INT&&($=r.RGBA32I)),x===r.RGB&&(F===r.UNSIGNED_SHORT&&re&&($=re.RGB16_EXT),F===r.SHORT&&re&&($=re.RGB16_SNORM_EXT),F===r.UNSIGNED_INT_5_9_9_9_REV&&($=r.RGB9_E5),F===r.UNSIGNED_INT_10F_11F_11F_REV&&($=r.R11F_G11F_B10F)),x===r.RGBA){const j=se?Gr:We.getTransfer(X);F===r.FLOAT&&($=r.RGBA32F),F===r.HALF_FLOAT&&($=r.RGBA16F),F===r.UNSIGNED_BYTE&&($=j===nt?r.SRGB8_ALPHA8:r.RGBA8),F===r.UNSIGNED_SHORT&&re&&($=re.RGBA16_EXT),F===r.SHORT&&re&&($=re.RGBA16_SNORM_EXT),F===r.UNSIGNED_SHORT_4_4_4_4&&($=r.RGBA4),F===r.UNSIGNED_SHORT_5_5_5_1&&($=r.RGB5_A1)}return($===r.R16F||$===r.R32F||$===r.RG16F||$===r.RG32F||$===r.RGBA16F||$===r.RGBA32F)&&e.get("EXT_color_buffer_float"),$}function M(b,x){let F;return b?x===null||x===Fi||x===Ls?F=r.DEPTH24_STENCIL8:x===Di?F=r.DEPTH32F_STENCIL8:x===Ds&&(F=r.DEPTH24_STENCIL8,Re("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):x===null||x===Fi||x===Ls?F=r.DEPTH_COMPONENT24:x===Di?F=r.DEPTH_COMPONENT32F:x===Ds&&(F=r.DEPTH_COMPONENT16),F}function E(b,x){return _(b)===!0||b.isFramebufferTexture&&b.minFilter!==bt&&b.minFilter!==Dt?Math.log2(Math.max(x.width,x.height))+1:b.mipmaps!==void 0&&b.mipmaps.length>0?b.mipmaps.length:b.isCompressedTexture&&Array.isArray(b.image)?x.mipmaps.length:1}function C(b){const x=b.target;x.removeEventListener("dispose",C),w(x),x.isVideoTexture&&h.delete(x),x.isHTMLTexture&&d.delete(x)}function g(b){const x=b.target;x.removeEventListener("dispose",g),P(x)}function w(b){const x=i.get(b);if(x.__webglInit===void 0)return;const F=b.source,G=f.get(F);if(G){const X=G[x.__cacheKey];X.usedTimes--,X.usedTimes===0&&R(b),Object.keys(G).length===0&&f.delete(F)}i.remove(b)}function R(b){const x=i.get(b);r.deleteTexture(x.__webglTexture);const F=b.source,G=f.get(F);delete G[x.__cacheKey],a.memory.textures--}function P(b){const x=i.get(b);if(b.depthTexture&&(b.depthTexture.dispose(),i.remove(b.depthTexture)),b.isWebGLCubeRenderTarget)for(let G=0;G<6;G++){if(Array.isArray(x.__webglFramebuffer[G]))for(let X=0;X<x.__webglFramebuffer[G].length;X++)r.deleteFramebuffer(x.__webglFramebuffer[G][X]);else r.deleteFramebuffer(x.__webglFramebuffer[G]);x.__webglDepthbuffer&&r.deleteRenderbuffer(x.__webglDepthbuffer[G])}else{if(Array.isArray(x.__webglFramebuffer))for(let G=0;G<x.__webglFramebuffer.length;G++)r.deleteFramebuffer(x.__webglFramebuffer[G]);else r.deleteFramebuffer(x.__webglFramebuffer);if(x.__webglDepthbuffer&&r.deleteRenderbuffer(x.__webglDepthbuffer),x.__webglMultisampledFramebuffer&&r.deleteFramebuffer(x.__webglMultisampledFramebuffer),x.__webglColorRenderbuffer)for(let G=0;G<x.__webglColorRenderbuffer.length;G++)x.__webglColorRenderbuffer[G]&&r.deleteRenderbuffer(x.__webglColorRenderbuffer[G]);x.__webglDepthRenderbuffer&&r.deleteRenderbuffer(x.__webglDepthRenderbuffer)}const F=b.textures;for(let G=0,X=F.length;G<X;G++){const se=i.get(F[G]);se.__webglTexture&&(r.deleteTexture(se.__webglTexture),a.memory.textures--),i.remove(F[G])}i.remove(b)}let O=0;function B(){O=0}function N(){return O}function H(b){O=b}function J(){const b=O;return b>=n.maxTextures&&Re("WebGLTextures: Trying to use "+(b+1)+" texture units while this GPU supports only "+n.maxTextures),O+=1,b}function V(b){const x=[];return x.push(b.wrapS),x.push(b.wrapT),x.push(b.wrapR||0),x.push(b.magFilter),x.push(b.minFilter),x.push(b.anisotropy),x.push(b.internalFormat),x.push(b.format),x.push(b.type),x.push(b.generateMipmaps),x.push(b.premultiplyAlpha),x.push(b.flipY),x.push(b.unpackAlignment),x.push(b.colorSpace),x.join()}function ne(b,x){const F=i.get(b);if(b.isVideoTexture&&L(b),b.isRenderTargetTexture===!1&&b.isExternalTexture!==!0&&b.version>0&&F.__version!==b.version){const G=b.image;if(G===null)Re("WebGLRenderer: Texture marked for update but no image data found.");else if(G.complete===!1)Re("WebGLRenderer: Texture marked for update but image is incomplete");else{xe(F,b,x);return}}else b.isExternalTexture&&(F.__webglTexture=b.sourceTexture?b.sourceTexture:null);t.bindTexture(r.TEXTURE_2D,F.__webglTexture,r.TEXTURE0+x)}function q(b,x){const F=i.get(b);if(b.isRenderTargetTexture===!1&&b.version>0&&F.__version!==b.version){xe(F,b,x);return}else b.isExternalTexture&&(F.__webglTexture=b.sourceTexture?b.sourceTexture:null);t.bindTexture(r.TEXTURE_2D_ARRAY,F.__webglTexture,r.TEXTURE0+x)}function ee(b,x){const F=i.get(b);if(b.isRenderTargetTexture===!1&&b.version>0&&F.__version!==b.version){xe(F,b,x);return}t.bindTexture(r.TEXTURE_3D,F.__webglTexture,r.TEXTURE0+x)}function ie(b,x){const F=i.get(b);if(b.isCubeDepthTexture!==!0&&b.version>0&&F.__version!==b.version){Pe(F,b,x);return}t.bindTexture(r.TEXTURE_CUBE_MAP,F.__webglTexture,r.TEXTURE0+x)}const Ae={[po]:r.REPEAT,[ii]:r.CLAMP_TO_EDGE,[_o]:r.MIRRORED_REPEAT},Te={[bt]:r.NEAREST,[jd]:r.NEAREST_MIPMAP_NEAREST,[Vs]:r.NEAREST_MIPMAP_LINEAR,[Dt]:r.LINEAR,[ha]:r.LINEAR_MIPMAP_NEAREST,[Tn]:r.LINEAR_MIPMAP_LINEAR},lt={[ef]:r.NEVER,[af]:r.ALWAYS,[tf]:r.LESS,[il]:r.LEQUAL,[nf]:r.EQUAL,[nl]:r.GEQUAL,[sf]:r.GREATER,[rf]:r.NOTEQUAL};function qe(b,x){if(x.type===Di&&e.has("OES_texture_float_linear")===!1&&(x.magFilter===Dt||x.magFilter===ha||x.magFilter===Vs||x.magFilter===Tn||x.minFilter===Dt||x.minFilter===ha||x.minFilter===Vs||x.minFilter===Tn)&&Re("WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),r.texParameteri(b,r.TEXTURE_WRAP_S,Ae[x.wrapS]),r.texParameteri(b,r.TEXTURE_WRAP_T,Ae[x.wrapT]),(b===r.TEXTURE_3D||b===r.TEXTURE_2D_ARRAY)&&r.texParameteri(b,r.TEXTURE_WRAP_R,Ae[x.wrapR]),r.texParameteri(b,r.TEXTURE_MAG_FILTER,Te[x.magFilter]),r.texParameteri(b,r.TEXTURE_MIN_FILTER,Te[x.minFilter]),x.compareFunction&&(r.texParameteri(b,r.TEXTURE_COMPARE_MODE,r.COMPARE_REF_TO_TEXTURE),r.texParameteri(b,r.TEXTURE_COMPARE_FUNC,lt[x.compareFunction])),e.has("EXT_texture_filter_anisotropic")===!0){if(x.magFilter===bt||x.minFilter!==Vs&&x.minFilter!==Tn||x.type===Di&&e.has("OES_texture_float_linear")===!1)return;if(x.anisotropy>1||i.get(x).__currentAnisotropy){const F=e.get("EXT_texture_filter_anisotropic");r.texParameterf(b,F.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(x.anisotropy,n.getMaxAnisotropy())),i.get(x).__currentAnisotropy=x.anisotropy}}}function je(b,x){let F=!1;b.__webglInit===void 0&&(b.__webglInit=!0,x.addEventListener("dispose",C));const G=x.source;let X=f.get(G);X===void 0&&(X={},f.set(G,X));const se=V(x);if(se!==b.__cacheKey){X[se]===void 0&&(X[se]={texture:r.createTexture(),usedTimes:0},a.memory.textures++,F=!0),X[se].usedTimes++;const re=X[b.__cacheKey];re!==void 0&&(X[b.__cacheKey].usedTimes--,re.usedTimes===0&&R(x)),b.__cacheKey=se,b.__webglTexture=X[se].texture}return F}function Y(b,x,F){return Math.floor(Math.floor(b/F)/x)}function Q(b,x,F,G){const se=b.updateRanges;if(se.length===0)t.texSubImage2D(r.TEXTURE_2D,0,0,0,x.width,x.height,F,G,x.data);else{se.sort((Ee,he)=>Ee.start-he.start);let re=0;for(let Ee=1;Ee<se.length;Ee++){const he=se[re],oe=se[Ee],we=he.start+he.count,Ce=Y(oe.start,x.width,4),De=Y(he.start,x.width,4);oe.start<=we+1&&Ce===De&&Y(oe.start+oe.count-1,x.width,4)===Ce?he.count=Math.max(he.count,oe.start+oe.count-he.start):(++re,se[re]=oe)}se.length=re+1;const $=t.getParameter(r.UNPACK_ROW_LENGTH),j=t.getParameter(r.UNPACK_SKIP_PIXELS),ae=t.getParameter(r.UNPACK_SKIP_ROWS);t.pixelStorei(r.UNPACK_ROW_LENGTH,x.width);for(let Ee=0,he=se.length;Ee<he;Ee++){const oe=se[Ee],we=Math.floor(oe.start/4),Ce=Math.ceil(oe.count/4),De=we%x.width,D=Math.floor(we/x.width),le=Ce,K=1;t.pixelStorei(r.UNPACK_SKIP_PIXELS,De),t.pixelStorei(r.UNPACK_SKIP_ROWS,D),t.texSubImage2D(r.TEXTURE_2D,0,De,D,le,K,F,G,x.data)}b.clearUpdateRanges(),t.pixelStorei(r.UNPACK_ROW_LENGTH,$),t.pixelStorei(r.UNPACK_SKIP_PIXELS,j),t.pixelStorei(r.UNPACK_SKIP_ROWS,ae)}}function xe(b,x,F){let G=r.TEXTURE_2D;(x.isDataArrayTexture||x.isCompressedArrayTexture)&&(G=r.TEXTURE_2D_ARRAY),x.isData3DTexture&&(G=r.TEXTURE_3D);const X=je(b,x),se=x.source;t.bindTexture(G,b.__webglTexture,r.TEXTURE0+F);const re=i.get(se);if(se.version!==re.__version||X===!0){if(t.activeTexture(r.TEXTURE0+F),(typeof ImageBitmap<"u"&&x.image instanceof ImageBitmap)===!1){const K=We.getPrimaries(We.workingColorSpace),ce=x.colorSpace===fn?null:We.getPrimaries(x.colorSpace),pe=x.colorSpace===fn||K===ce?r.NONE:r.BROWSER_DEFAULT_WEBGL;t.pixelStorei(r.UNPACK_FLIP_Y_WEBGL,x.flipY),t.pixelStorei(r.UNPACK_PREMULTIPLY_ALPHA_WEBGL,x.premultiplyAlpha),t.pixelStorei(r.UNPACK_COLORSPACE_CONVERSION_WEBGL,pe)}t.pixelStorei(r.UNPACK_ALIGNMENT,x.unpackAlignment);let j=p(x.image,!1,n.maxTextureSize);j=Nt(x,j);const ae=s.convert(x.format,x.colorSpace),Ee=s.convert(x.type);let he=S(x.internalFormat,ae,Ee,x.normalized,x.colorSpace,x.isVideoTexture);qe(G,x);let oe;const we=x.mipmaps,Ce=x.isVideoTexture!==!0,De=re.__version===void 0||X===!0,D=se.dataReady,le=E(x,j);if(x.isDepthTexture)he=M(x.format===bn,x.type),De&&(Ce?t.texStorage2D(r.TEXTURE_2D,1,he,j.width,j.height):t.texImage2D(r.TEXTURE_2D,0,he,j.width,j.height,0,ae,Ee,null));else if(x.isDataTexture)if(we.length>0){Ce&&De&&t.texStorage2D(r.TEXTURE_2D,le,he,we[0].width,we[0].height);for(let K=0,ce=we.length;K<ce;K++)oe=we[K],Ce?D&&t.texSubImage2D(r.TEXTURE_2D,K,0,0,oe.width,oe.height,ae,Ee,oe.data):t.texImage2D(r.TEXTURE_2D,K,he,oe.width,oe.height,0,ae,Ee,oe.data);x.generateMipmaps=!1}else Ce?(De&&t.texStorage2D(r.TEXTURE_2D,le,he,j.width,j.height),D&&Q(x,j,ae,Ee)):t.texImage2D(r.TEXTURE_2D,0,he,j.width,j.height,0,ae,Ee,j.data);else if(x.isCompressedTexture)if(x.isCompressedArrayTexture){Ce&&De&&t.texStorage3D(r.TEXTURE_2D_ARRAY,le,he,we[0].width,we[0].height,j.depth);for(let K=0,ce=we.length;K<ce;K++)if(oe=we[K],x.format!==ci)if(ae!==null)if(Ce){if(D)if(x.layerUpdates.size>0){const pe=lc(oe.width,oe.height,x.format,x.type);for(const te of x.layerUpdates){const be=oe.data.subarray(te*pe/oe.data.BYTES_PER_ELEMENT,(te+1)*pe/oe.data.BYTES_PER_ELEMENT);t.compressedTexSubImage3D(r.TEXTURE_2D_ARRAY,K,0,0,te,oe.width,oe.height,1,ae,be)}}else t.compressedTexSubImage3D(r.TEXTURE_2D_ARRAY,K,0,0,0,oe.width,oe.height,j.depth,ae,oe.data)}else t.compressedTexImage3D(r.TEXTURE_2D_ARRAY,K,he,oe.width,oe.height,j.depth,0,oe.data,0,0);else Re("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else Ce?D&&t.texSubImage3D(r.TEXTURE_2D_ARRAY,K,0,0,0,oe.width,oe.height,j.depth,ae,Ee,oe.data):t.texImage3D(r.TEXTURE_2D_ARRAY,K,he,oe.width,oe.height,j.depth,0,ae,Ee,oe.data);x.layerUpdates.size>0&&x.clearLayerUpdates()}else{Ce&&De&&t.texStorage2D(r.TEXTURE_2D,le,he,we[0].width,we[0].height);for(let K=0,ce=we.length;K<ce;K++)oe=we[K],x.format!==ci?ae!==null?Ce?D&&t.compressedTexSubImage2D(r.TEXTURE_2D,K,0,0,oe.width,oe.height,ae,oe.data):t.compressedTexImage2D(r.TEXTURE_2D,K,he,oe.width,oe.height,0,oe.data):Re("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):Ce?D&&t.texSubImage2D(r.TEXTURE_2D,K,0,0,oe.width,oe.height,ae,Ee,oe.data):t.texImage2D(r.TEXTURE_2D,K,he,oe.width,oe.height,0,ae,Ee,oe.data)}else if(x.isDataArrayTexture)if(Ce){if(De&&t.texStorage3D(r.TEXTURE_2D_ARRAY,le,he,j.width,j.height,j.depth),D)if(x.layerUpdates.size>0){const K=lc(j.width,j.height,x.format,x.type);for(const ce of x.layerUpdates){const pe=j.data.subarray(ce*K/j.data.BYTES_PER_ELEMENT,(ce+1)*K/j.data.BYTES_PER_ELEMENT);t.texSubImage3D(r.TEXTURE_2D_ARRAY,0,0,0,ce,j.width,j.height,1,ae,Ee,pe)}x.clearLayerUpdates()}else t.texSubImage3D(r.TEXTURE_2D_ARRAY,0,0,0,0,j.width,j.height,j.depth,ae,Ee,j.data)}else t.texImage3D(r.TEXTURE_2D_ARRAY,0,he,j.width,j.height,j.depth,0,ae,Ee,j.data);else if(x.isData3DTexture)Ce?(De&&t.texStorage3D(r.TEXTURE_3D,le,he,j.width,j.height,j.depth),D&&t.texSubImage3D(r.TEXTURE_3D,0,0,0,0,j.width,j.height,j.depth,ae,Ee,j.data)):t.texImage3D(r.TEXTURE_3D,0,he,j.width,j.height,j.depth,0,ae,Ee,j.data);else if(x.isFramebufferTexture){if(De)if(Ce)t.texStorage2D(r.TEXTURE_2D,le,he,j.width,j.height);else{let K=j.width,ce=j.height;for(let pe=0;pe<le;pe++)t.texImage2D(r.TEXTURE_2D,pe,he,K,ce,0,ae,Ee,null),K>>=1,ce>>=1}}else if(x.isHTMLTexture){if("texElementImage2D"in r){const K=r.canvas;if(K.hasAttribute("layoutsubtree")||K.setAttribute("layoutsubtree","true"),j.parentNode!==K){K.appendChild(j),d.add(x),K.onpaint=ce=>{const pe=ce.changedElements;for(const te of d)pe.includes(te.image)&&(te.needsUpdate=!0)},K.requestPaint();return}if(r.texElementImage2D.length===3)r.texElementImage2D(r.TEXTURE_2D,r.RGBA8,j);else{const pe=r.RGBA,te=r.RGBA,be=r.UNSIGNED_BYTE;r.texElementImage2D(r.TEXTURE_2D,0,pe,te,be,j)}r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.LINEAR),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE),r.texParameteri(r.TEXTURE_2D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE)}}else if(we.length>0){if(Ce&&De){const K=et(we[0]);t.texStorage2D(r.TEXTURE_2D,le,he,K.width,K.height)}for(let K=0,ce=we.length;K<ce;K++)oe=we[K],Ce?D&&t.texSubImage2D(r.TEXTURE_2D,K,0,0,ae,Ee,oe):t.texImage2D(r.TEXTURE_2D,K,he,ae,Ee,oe);x.generateMipmaps=!1}else if(Ce){if(De){const K=et(j);t.texStorage2D(r.TEXTURE_2D,le,he,K.width,K.height)}D&&t.texSubImage2D(r.TEXTURE_2D,0,0,0,ae,Ee,j)}else t.texImage2D(r.TEXTURE_2D,0,he,ae,Ee,j);_(x)&&T(G),re.__version=se.version,x.onUpdate&&x.onUpdate(x)}b.__version=x.version}function Pe(b,x,F){if(x.image.length!==6)return;const G=je(b,x),X=x.source;t.bindTexture(r.TEXTURE_CUBE_MAP,b.__webglTexture,r.TEXTURE0+F);const se=i.get(X);if(X.version!==se.__version||G===!0){t.activeTexture(r.TEXTURE0+F);const re=We.getPrimaries(We.workingColorSpace),$=x.colorSpace===fn?null:We.getPrimaries(x.colorSpace),j=x.colorSpace===fn||re===$?r.NONE:r.BROWSER_DEFAULT_WEBGL;t.pixelStorei(r.UNPACK_FLIP_Y_WEBGL,x.flipY),t.pixelStorei(r.UNPACK_PREMULTIPLY_ALPHA_WEBGL,x.premultiplyAlpha),t.pixelStorei(r.UNPACK_ALIGNMENT,x.unpackAlignment),t.pixelStorei(r.UNPACK_COLORSPACE_CONVERSION_WEBGL,j);const ae=x.isCompressedTexture||x.image[0].isCompressedTexture,Ee=x.image[0]&&x.image[0].isDataTexture,he=[];for(let te=0;te<6;te++)!ae&&!Ee?he[te]=p(x.image[te],!0,n.maxCubemapSize):he[te]=Ee?x.image[te].image:x.image[te],he[te]=Nt(x,he[te]);const oe=he[0],we=s.convert(x.format,x.colorSpace),Ce=s.convert(x.type),De=S(x.internalFormat,we,Ce,x.normalized,x.colorSpace),D=x.isVideoTexture!==!0,le=se.__version===void 0||G===!0,K=X.dataReady;let ce=E(x,oe);qe(r.TEXTURE_CUBE_MAP,x);let pe;if(ae){D&&le&&t.texStorage2D(r.TEXTURE_CUBE_MAP,ce,De,oe.width,oe.height);for(let te=0;te<6;te++){pe=he[te].mipmaps;for(let be=0;be<pe.length;be++){const Se=pe[be];x.format!==ci?we!==null?D?K&&t.compressedTexSubImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+te,be,0,0,Se.width,Se.height,we,Se.data):t.compressedTexImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+te,be,De,Se.width,Se.height,0,Se.data):Re("WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):D?K&&t.texSubImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+te,be,0,0,Se.width,Se.height,we,Ce,Se.data):t.texImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+te,be,De,Se.width,Se.height,0,we,Ce,Se.data)}}}else{if(pe=x.mipmaps,D&&le){pe.length>0&&ce++;const te=et(he[0]);t.texStorage2D(r.TEXTURE_CUBE_MAP,ce,De,te.width,te.height)}for(let te=0;te<6;te++)if(Ee){D?K&&t.texSubImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+te,0,0,0,he[te].width,he[te].height,we,Ce,he[te].data):t.texImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+te,0,De,he[te].width,he[te].height,0,we,Ce,he[te].data);for(let be=0;be<pe.length;be++){const ht=pe[be].image[te].image;D?K&&t.texSubImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+te,be+1,0,0,ht.width,ht.height,we,Ce,ht.data):t.texImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+te,be+1,De,ht.width,ht.height,0,we,Ce,ht.data)}}else{D?K&&t.texSubImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+te,0,0,0,we,Ce,he[te]):t.texImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+te,0,De,we,Ce,he[te]);for(let be=0;be<pe.length;be++){const Se=pe[be];D?K&&t.texSubImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+te,be+1,0,0,we,Ce,Se.image[te]):t.texImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+te,be+1,De,we,Ce,Se.image[te])}}}_(x)&&T(r.TEXTURE_CUBE_MAP),se.__version=X.version,x.onUpdate&&x.onUpdate(x)}b.__version=x.version}function me(b,x,F,G,X,se){const re=s.convert(F.format,F.colorSpace),$=s.convert(F.type),j=S(F.internalFormat,re,$,F.normalized,F.colorSpace),ae=i.get(x),Ee=i.get(F);if(Ee.__renderTarget=x,!ae.__hasExternalTextures){const he=Math.max(1,x.width>>se),oe=Math.max(1,x.height>>se);X===r.TEXTURE_3D||X===r.TEXTURE_2D_ARRAY?t.texImage3D(X,se,j,he,oe,x.depth,0,re,$,null):t.texImage2D(X,se,j,he,oe,0,re,$,null)}t.bindFramebuffer(r.FRAMEBUFFER,b),St(x)?o.framebufferTexture2DMultisampleEXT(r.FRAMEBUFFER,G,X,Ee.__webglTexture,0,mt(x)):(X===r.TEXTURE_2D||X>=r.TEXTURE_CUBE_MAP_POSITIVE_X&&X<=r.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&r.framebufferTexture2D(r.FRAMEBUFFER,G,X,Ee.__webglTexture,se),t.bindFramebuffer(r.FRAMEBUFFER,null)}function Fe(b,x,F){if(r.bindRenderbuffer(r.RENDERBUFFER,b),x.depthBuffer){const G=x.depthTexture,X=G&&G.isDepthTexture?G.type:null,se=M(x.stencilBuffer,X),re=x.stencilBuffer?r.DEPTH_STENCIL_ATTACHMENT:r.DEPTH_ATTACHMENT;St(x)?o.renderbufferStorageMultisampleEXT(r.RENDERBUFFER,mt(x),se,x.width,x.height):F?r.renderbufferStorageMultisample(r.RENDERBUFFER,mt(x),se,x.width,x.height):r.renderbufferStorage(r.RENDERBUFFER,se,x.width,x.height),r.framebufferRenderbuffer(r.FRAMEBUFFER,re,r.RENDERBUFFER,b)}else{const G=x.textures;for(let X=0;X<G.length;X++){const se=G[X],re=s.convert(se.format,se.colorSpace),$=s.convert(se.type),j=S(se.internalFormat,re,$,se.normalized,se.colorSpace);St(x)?o.renderbufferStorageMultisampleEXT(r.RENDERBUFFER,mt(x),j,x.width,x.height):F?r.renderbufferStorageMultisample(r.RENDERBUFFER,mt(x),j,x.width,x.height):r.renderbufferStorage(r.RENDERBUFFER,j,x.width,x.height)}}r.bindRenderbuffer(r.RENDERBUFFER,null)}function Tt(b,x,F){const G=x.isWebGLCubeRenderTarget===!0;if(t.bindFramebuffer(r.FRAMEBUFFER,b),!(x.depthTexture&&x.depthTexture.isDepthTexture))throw new Error("THREE.WebGLTextures: renderTarget.depthTexture must be an instance of THREE.DepthTexture.");const X=i.get(x.depthTexture);if(X.__renderTarget=x,(!X.__webglTexture||x.depthTexture.image.width!==x.width||x.depthTexture.image.height!==x.height)&&(x.depthTexture.image.width=x.width,x.depthTexture.image.height=x.height,x.depthTexture.needsUpdate=!0),G){if(X.__webglInit===void 0&&(X.__webglInit=!0,x.depthTexture.addEventListener("dispose",C)),X.__webglTexture===void 0){X.__webglTexture=r.createTexture(),t.bindTexture(r.TEXTURE_CUBE_MAP,X.__webglTexture),qe(r.TEXTURE_CUBE_MAP,x.depthTexture);const ae=s.convert(x.depthTexture.format),Ee=s.convert(x.depthTexture.type);let he;x.depthTexture.format===Qi?he=r.DEPTH_COMPONENT24:x.depthTexture.format===bn&&(he=r.DEPTH24_STENCIL8);for(let oe=0;oe<6;oe++)r.texImage2D(r.TEXTURE_CUBE_MAP_POSITIVE_X+oe,0,he,x.width,x.height,0,ae,Ee,null)}}else ne(x.depthTexture,0);const se=X.__webglTexture,re=mt(x),$=G?r.TEXTURE_CUBE_MAP_POSITIVE_X+F:r.TEXTURE_2D,j=x.depthTexture.format===bn?r.DEPTH_STENCIL_ATTACHMENT:r.DEPTH_ATTACHMENT;if(x.depthTexture.format===Qi)St(x)?o.framebufferTexture2DMultisampleEXT(r.FRAMEBUFFER,j,$,se,0,re):r.framebufferTexture2D(r.FRAMEBUFFER,j,$,se,0);else if(x.depthTexture.format===bn)St(x)?o.framebufferTexture2DMultisampleEXT(r.FRAMEBUFFER,j,$,se,0,re):r.framebufferTexture2D(r.FRAMEBUFFER,j,$,se,0);else throw new Error("THREE.WebGLTextures: Unknown depthTexture format.")}function Oe(b){const x=i.get(b),F=b.isWebGLCubeRenderTarget===!0;if(x.__boundDepthTexture!==b.depthTexture){const G=b.depthTexture;if(x.__depthDisposeCallback&&x.__depthDisposeCallback(),G){const X=()=>{delete x.__boundDepthTexture,delete x.__depthDisposeCallback,G.removeEventListener("dispose",X)};G.addEventListener("dispose",X),x.__depthDisposeCallback=X}x.__boundDepthTexture=G}if(b.depthTexture&&!x.__autoAllocateDepthBuffer)if(F)for(let G=0;G<6;G++)Tt(x.__webglFramebuffer[G],b,G);else{const G=b.texture.mipmaps;G&&G.length>0?Tt(x.__webglFramebuffer[0],b,0):Tt(x.__webglFramebuffer,b,0)}else if(F){x.__webglDepthbuffer=[];for(let G=0;G<6;G++)if(t.bindFramebuffer(r.FRAMEBUFFER,x.__webglFramebuffer[G]),x.__webglDepthbuffer[G]===void 0)x.__webglDepthbuffer[G]=r.createRenderbuffer(),Fe(x.__webglDepthbuffer[G],b,!1);else{const X=b.stencilBuffer?r.DEPTH_STENCIL_ATTACHMENT:r.DEPTH_ATTACHMENT,se=x.__webglDepthbuffer[G];r.bindRenderbuffer(r.RENDERBUFFER,se),r.framebufferRenderbuffer(r.FRAMEBUFFER,X,r.RENDERBUFFER,se)}}else{const G=b.texture.mipmaps;if(G&&G.length>0?t.bindFramebuffer(r.FRAMEBUFFER,x.__webglFramebuffer[0]):t.bindFramebuffer(r.FRAMEBUFFER,x.__webglFramebuffer),x.__webglDepthbuffer===void 0)x.__webglDepthbuffer=r.createRenderbuffer(),Fe(x.__webglDepthbuffer,b,!1);else{const X=b.stencilBuffer?r.DEPTH_STENCIL_ATTACHMENT:r.DEPTH_ATTACHMENT,se=x.__webglDepthbuffer;r.bindRenderbuffer(r.RENDERBUFFER,se),r.framebufferRenderbuffer(r.FRAMEBUFFER,X,r.RENDERBUFFER,se)}}t.bindFramebuffer(r.FRAMEBUFFER,null)}function $e(b,x,F){const G=i.get(b);x!==void 0&&me(G.__webglFramebuffer,b,b.texture,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,0),F!==void 0&&Oe(b)}function ct(b){const x=b.texture,F=i.get(b),G=i.get(x);b.addEventListener("dispose",g);const X=b.textures,se=b.isWebGLCubeRenderTarget===!0,re=X.length>1;if(re||(G.__webglTexture===void 0&&(G.__webglTexture=r.createTexture()),G.__version=x.version,a.memory.textures++),se){F.__webglFramebuffer=[];for(let $=0;$<6;$++)if(x.mipmaps&&x.mipmaps.length>0){F.__webglFramebuffer[$]=[];for(let j=0;j<x.mipmaps.length;j++)F.__webglFramebuffer[$][j]=r.createFramebuffer()}else F.__webglFramebuffer[$]=r.createFramebuffer()}else{if(x.mipmaps&&x.mipmaps.length>0){F.__webglFramebuffer=[];for(let $=0;$<x.mipmaps.length;$++)F.__webglFramebuffer[$]=r.createFramebuffer()}else F.__webglFramebuffer=r.createFramebuffer();if(re)for(let $=0,j=X.length;$<j;$++){const ae=i.get(X[$]);ae.__webglTexture===void 0&&(ae.__webglTexture=r.createTexture(),a.memory.textures++)}if(b.samples>0&&St(b)===!1){F.__webglMultisampledFramebuffer=r.createFramebuffer(),F.__webglColorRenderbuffer=[],t.bindFramebuffer(r.FRAMEBUFFER,F.__webglMultisampledFramebuffer);for(let $=0;$<X.length;$++){const j=X[$];F.__webglColorRenderbuffer[$]=r.createRenderbuffer(),r.bindRenderbuffer(r.RENDERBUFFER,F.__webglColorRenderbuffer[$]);const ae=s.convert(j.format,j.colorSpace),Ee=s.convert(j.type),he=S(j.internalFormat,ae,Ee,j.normalized,j.colorSpace,b.isXRRenderTarget===!0),oe=mt(b);r.renderbufferStorageMultisample(r.RENDERBUFFER,oe,he,b.width,b.height),r.framebufferRenderbuffer(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0+$,r.RENDERBUFFER,F.__webglColorRenderbuffer[$])}r.bindRenderbuffer(r.RENDERBUFFER,null),b.depthBuffer&&(F.__webglDepthRenderbuffer=r.createRenderbuffer(),Fe(F.__webglDepthRenderbuffer,b,!0)),t.bindFramebuffer(r.FRAMEBUFFER,null)}}if(se){t.bindTexture(r.TEXTURE_CUBE_MAP,G.__webglTexture),qe(r.TEXTURE_CUBE_MAP,x);for(let $=0;$<6;$++)if(x.mipmaps&&x.mipmaps.length>0)for(let j=0;j<x.mipmaps.length;j++)me(F.__webglFramebuffer[$][j],b,x,r.COLOR_ATTACHMENT0,r.TEXTURE_CUBE_MAP_POSITIVE_X+$,j);else me(F.__webglFramebuffer[$],b,x,r.COLOR_ATTACHMENT0,r.TEXTURE_CUBE_MAP_POSITIVE_X+$,0);_(x)&&T(r.TEXTURE_CUBE_MAP),t.unbindTexture()}else if(re){for(let $=0,j=X.length;$<j;$++){const ae=X[$],Ee=i.get(ae);let he=r.TEXTURE_2D;(b.isWebGL3DRenderTarget||b.isWebGLArrayRenderTarget)&&(he=b.isWebGL3DRenderTarget?r.TEXTURE_3D:r.TEXTURE_2D_ARRAY),t.bindTexture(he,Ee.__webglTexture),qe(he,ae),me(F.__webglFramebuffer,b,ae,r.COLOR_ATTACHMENT0+$,he,0),_(ae)&&T(he)}t.unbindTexture()}else{let $=r.TEXTURE_2D;if((b.isWebGL3DRenderTarget||b.isWebGLArrayRenderTarget)&&($=b.isWebGL3DRenderTarget?r.TEXTURE_3D:r.TEXTURE_2D_ARRAY),t.bindTexture($,G.__webglTexture),qe($,x),x.mipmaps&&x.mipmaps.length>0)for(let j=0;j<x.mipmaps.length;j++)me(F.__webglFramebuffer[j],b,x,r.COLOR_ATTACHMENT0,$,j);else me(F.__webglFramebuffer,b,x,r.COLOR_ATTACHMENT0,$,0);_(x)&&T($),t.unbindTexture()}b.depthBuffer&&Oe(b)}function ke(b){const x=b.textures;for(let F=0,G=x.length;F<G;F++){const X=x[F];if(_(X)){const se=A(b),re=i.get(X).__webglTexture;t.bindTexture(se,re),T(se),t.unbindTexture()}}}const pt=[],Rt=[];function Gt(b){if(b.samples>0){if(St(b)===!1){const x=b.textures,F=b.width,G=b.height;let X=r.COLOR_BUFFER_BIT;const se=b.stencilBuffer?r.DEPTH_STENCIL_ATTACHMENT:r.DEPTH_ATTACHMENT,re=i.get(b),$=x.length>1;if($)for(let ae=0;ae<x.length;ae++)t.bindFramebuffer(r.FRAMEBUFFER,re.__webglMultisampledFramebuffer),r.framebufferRenderbuffer(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0+ae,r.RENDERBUFFER,null),t.bindFramebuffer(r.FRAMEBUFFER,re.__webglFramebuffer),r.framebufferTexture2D(r.DRAW_FRAMEBUFFER,r.COLOR_ATTACHMENT0+ae,r.TEXTURE_2D,null,0);t.bindFramebuffer(r.READ_FRAMEBUFFER,re.__webglMultisampledFramebuffer);const j=b.texture.mipmaps;j&&j.length>0?t.bindFramebuffer(r.DRAW_FRAMEBUFFER,re.__webglFramebuffer[0]):t.bindFramebuffer(r.DRAW_FRAMEBUFFER,re.__webglFramebuffer);for(let ae=0;ae<x.length;ae++){if(b.resolveDepthBuffer&&(b.depthBuffer&&(X|=r.DEPTH_BUFFER_BIT),b.stencilBuffer&&b.resolveStencilBuffer&&(X|=r.STENCIL_BUFFER_BIT)),$){r.framebufferRenderbuffer(r.READ_FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.RENDERBUFFER,re.__webglColorRenderbuffer[ae]);const Ee=i.get(x[ae]).__webglTexture;r.framebufferTexture2D(r.DRAW_FRAMEBUFFER,r.COLOR_ATTACHMENT0,r.TEXTURE_2D,Ee,0)}r.blitFramebuffer(0,0,F,G,0,0,F,G,X,r.NEAREST),l===!0&&(pt.length=0,Rt.length=0,pt.push(r.COLOR_ATTACHMENT0+ae),b.depthBuffer&&b.storeMultisampledDepthBuffer===!1&&(pt.push(se),Rt.push(se),r.invalidateFramebuffer(r.DRAW_FRAMEBUFFER,Rt)),r.invalidateFramebuffer(r.READ_FRAMEBUFFER,pt))}if(t.bindFramebuffer(r.READ_FRAMEBUFFER,null),t.bindFramebuffer(r.DRAW_FRAMEBUFFER,null),$)for(let ae=0;ae<x.length;ae++){t.bindFramebuffer(r.FRAMEBUFFER,re.__webglMultisampledFramebuffer),r.framebufferRenderbuffer(r.FRAMEBUFFER,r.COLOR_ATTACHMENT0+ae,r.RENDERBUFFER,re.__webglColorRenderbuffer[ae]);const Ee=i.get(x[ae]).__webglTexture;t.bindFramebuffer(r.FRAMEBUFFER,re.__webglFramebuffer),r.framebufferTexture2D(r.DRAW_FRAMEBUFFER,r.COLOR_ATTACHMENT0+ae,r.TEXTURE_2D,Ee,0)}t.bindFramebuffer(r.DRAW_FRAMEBUFFER,re.__webglMultisampledFramebuffer)}else if(b.depthBuffer&&b.storeMultisampledDepthBuffer===!1&&l){const x=b.stencilBuffer?r.DEPTH_STENCIL_ATTACHMENT:r.DEPTH_ATTACHMENT;r.invalidateFramebuffer(r.DRAW_FRAMEBUFFER,[x])}}}function mt(b){return Math.min(n.maxSamples,b.samples)}function St(b){const x=i.get(b);return b.samples>0&&e.has("WEBGL_multisampled_render_to_texture")===!0&&x.__useRenderToTexture!==!1}function L(b){const x=a.render.frame;h.get(b)!==x&&(h.set(b,x),b.update())}function Nt(b,x){const F=b.colorSpace,G=b.format,X=b.type;return b.isCompressedTexture===!0||b.isVideoTexture===!0||F!==Hr&&F!==fn&&(We.getTransfer(F)===nt?(G!==ci||X!==ti)&&Re("WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):Ke("WebGLTextures: Unsupported texture color space:",F)),x}function et(b){return typeof HTMLImageElement<"u"&&b instanceof HTMLImageElement?(c.width=b.naturalWidth||b.width,c.height=b.naturalHeight||b.height):typeof VideoFrame<"u"&&b instanceof VideoFrame?(c.width=b.displayWidth,c.height=b.displayHeight):(c.width=b.width,c.height=b.height),c}this.allocateTextureUnit=J,this.resetTextureUnits=B,this.getTextureUnits=N,this.setTextureUnits=H,this.setTexture2D=ne,this.setTexture2DArray=q,this.setTexture3D=ee,this.setTextureCube=ie,this.rebindTextures=$e,this.setupRenderTarget=ct,this.updateRenderTargetMipmap=ke,this.updateMultisampleRenderTarget=Gt,this.setupDepthRenderbuffer=Oe,this.setupFrameBufferTexture=me,this.useMultisampledRTT=St,this.isReversedDepthBuffer=function(){return t.buffers.depth.getReversed()}}function N0(r,e){function t(i,n=fn){let s;const a=We.getTransfer(n);if(i===ti)return r.UNSIGNED_BYTE;if(i===Jo)return r.UNSIGNED_SHORT_4_4_4_4;if(i===Zo)return r.UNSIGNED_SHORT_5_5_5_1;if(i===Tu)return r.UNSIGNED_INT_5_9_9_9_REV;if(i===bu)return r.UNSIGNED_INT_10F_11F_11F_REV;if(i===Eu)return r.BYTE;if(i===wu)return r.SHORT;if(i===Ds)return r.UNSIGNED_SHORT;if(i===jo)return r.INT;if(i===Fi)return r.UNSIGNED_INT;if(i===Di)return r.FLOAT;if(i===Oi)return r.HALF_FLOAT;if(i===Au)return r.ALPHA;if(i===Cu)return r.RGB;if(i===ci)return r.RGBA;if(i===Qi)return r.DEPTH_COMPONENT;if(i===bn)return r.DEPTH_STENCIL;if(i===Ru)return r.RED;if(i===Qo)return r.RED_INTEGER;if(i===Pn)return r.RG;if(i===el)return r.RG_INTEGER;if(i===tl)return r.RGBA_INTEGER;if(i===Ir||i===Dr||i===Lr||i===Nr)if(a===nt)if(s=e.get("WEBGL_compressed_texture_s3tc_srgb"),s!==null){if(i===Ir)return s.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(i===Dr)return s.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(i===Lr)return s.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(i===Nr)return s.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(s=e.get("WEBGL_compressed_texture_s3tc"),s!==null){if(i===Ir)return s.COMPRESSED_RGB_S3TC_DXT1_EXT;if(i===Dr)return s.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(i===Lr)return s.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(i===Nr)return s.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(i===mo||i===go||i===xo||i===yo)if(s=e.get("WEBGL_compressed_texture_pvrtc"),s!==null){if(i===mo)return s.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(i===go)return s.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(i===xo)return s.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(i===yo)return s.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(i===vo||i===So||i===Mo||i===Eo||i===wo||i===kr||i===To)if(s=e.get("WEBGL_compressed_texture_etc"),s!==null){if(i===vo||i===So)return a===nt?s.COMPRESSED_SRGB8_ETC2:s.COMPRESSED_RGB8_ETC2;if(i===Mo)return a===nt?s.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:s.COMPRESSED_RGBA8_ETC2_EAC;if(i===Eo)return s.COMPRESSED_R11_EAC;if(i===wo)return s.COMPRESSED_SIGNED_R11_EAC;if(i===kr)return s.COMPRESSED_RG11_EAC;if(i===To)return s.COMPRESSED_SIGNED_RG11_EAC}else return null;if(i===bo||i===Ao||i===Co||i===Ro||i===Po||i===Io||i===Do||i===Lo||i===No||i===Fo||i===Oo||i===Uo||i===ko||i===Bo)if(s=e.get("WEBGL_compressed_texture_astc"),s!==null){if(i===bo)return a===nt?s.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:s.COMPRESSED_RGBA_ASTC_4x4_KHR;if(i===Ao)return a===nt?s.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:s.COMPRESSED_RGBA_ASTC_5x4_KHR;if(i===Co)return a===nt?s.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:s.COMPRESSED_RGBA_ASTC_5x5_KHR;if(i===Ro)return a===nt?s.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:s.COMPRESSED_RGBA_ASTC_6x5_KHR;if(i===Po)return a===nt?s.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:s.COMPRESSED_RGBA_ASTC_6x6_KHR;if(i===Io)return a===nt?s.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:s.COMPRESSED_RGBA_ASTC_8x5_KHR;if(i===Do)return a===nt?s.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:s.COMPRESSED_RGBA_ASTC_8x6_KHR;if(i===Lo)return a===nt?s.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:s.COMPRESSED_RGBA_ASTC_8x8_KHR;if(i===No)return a===nt?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:s.COMPRESSED_RGBA_ASTC_10x5_KHR;if(i===Fo)return a===nt?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:s.COMPRESSED_RGBA_ASTC_10x6_KHR;if(i===Oo)return a===nt?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:s.COMPRESSED_RGBA_ASTC_10x8_KHR;if(i===Uo)return a===nt?s.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:s.COMPRESSED_RGBA_ASTC_10x10_KHR;if(i===ko)return a===nt?s.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:s.COMPRESSED_RGBA_ASTC_12x10_KHR;if(i===Bo)return a===nt?s.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:s.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(i===Ho||i===Go||i===zo)if(s=e.get("EXT_texture_compression_bptc"),s!==null){if(i===Ho)return a===nt?s.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:s.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(i===Go)return s.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(i===zo)return s.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(i===Wo||i===Vo||i===Br||i===Xo)if(s=e.get("EXT_texture_compression_rgtc"),s!==null){if(i===Wo)return s.COMPRESSED_RED_RGTC1_EXT;if(i===Vo)return s.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(i===Br)return s.COMPRESSED_RED_GREEN_RGTC2_EXT;if(i===Xo)return s.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return i===Ls?r.UNSIGNED_INT_24_8:r[i]!==void 0?r[i]:null}return{convert:t}}const F0=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,O0=`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`;class U0{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(e,t){if(this.texture===null){const i=new Hu(e.texture);(e.depthNear!==t.depthNear||e.depthFar!==t.depthFar)&&(this.depthNear=e.depthNear,this.depthFar=e.depthFar),this.texture=i}}getMesh(e){if(this.texture!==null&&this.mesh===null){const t=e.cameras[0].viewport,i=new Si({vertexShader:F0,fragmentShader:O0,uniforms:{depthColor:{value:this.texture},depthWidth:{value:t.z},depthHeight:{value:t.w}}});this.mesh=new Ui(new Bs(20,20),i)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}}class k0 extends Dn{constructor(e,t){super();const i=this;let n=null,s=1,a=null,o="local-floor",l=1,c=null,h=null,d=null,u=null,f=null,m=null;const y=typeof XRWebGLBinding<"u",p=new U0,_={},T=t.getContextAttributes();let A=null,S=null;const M=[],E=[],C=new Ge;let g=null,w=null;const R=new mi;R.viewport=new xt;const P=new mi;P.viewport=new xt;const O=[R,P],B=new qf;let N=null,H=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(Y){let Q=M[Y];return Q===void 0&&(Q=new ya,M[Y]=Q),Q.getTargetRaySpace()},this.getControllerGrip=function(Y){let Q=M[Y];return Q===void 0&&(Q=new ya,M[Y]=Q),Q.getGripSpace()},this.getHand=function(Y){let Q=M[Y];return Q===void 0&&(Q=new ya,M[Y]=Q),Q.getHandSpace()};function J(Y){const Q=E.indexOf(Y.inputSource);if(Q===-1)return;const xe=M[Q];xe!==void 0&&(xe.update(Y.inputSource,Y.frame,c||a),xe.dispatchEvent({type:Y.type,data:Y.inputSource}))}function V(){n.removeEventListener("select",J),n.removeEventListener("selectstart",J),n.removeEventListener("selectend",J),n.removeEventListener("squeeze",J),n.removeEventListener("squeezestart",J),n.removeEventListener("squeezeend",J),n.removeEventListener("end",V),n.removeEventListener("inputsourceschange",ne);for(let Y=0;Y<M.length;Y++){const Q=E[Y];Q!==null&&(E[Y]=null,M[Y].disconnect(Q))}N=null,H=null,p.reset();for(const Y in _)delete _[Y];if(e.setRenderTarget(A),f=null,u=null,d=null,n=null,S=null,je.stop(),i.isPresenting=!1,e.setPixelRatio(g),e.setSize(C.width,C.height,!1),w!==null){const Y=w.camera;Y.fov=w.fov,Y.zoom=w.zoom,Y.updateProjectionMatrix(),w=null}i.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(Y){s=Y,i.isPresenting===!0&&Re("WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(Y){o=Y,i.isPresenting===!0&&Re("WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return c||a},this.setReferenceSpace=function(Y){c=Y},this.getBaseLayer=function(){return u!==null?u:f},this.getBinding=function(){return d===null&&y&&(d=new XRWebGLBinding(n,t)),d},this.getFrame=function(){return m},this.getSession=function(){return n},this.setSession=async function(Y){if(n=Y,n!==null){if(A=e.getRenderTarget(),n.addEventListener("select",J),n.addEventListener("selectstart",J),n.addEventListener("selectend",J),n.addEventListener("squeeze",J),n.addEventListener("squeezestart",J),n.addEventListener("squeezeend",J),n.addEventListener("end",V),n.addEventListener("inputsourceschange",ne),T.xrCompatible!==!0&&await t.makeXRCompatible(),g=e.getPixelRatio(),e.getSize(C),y&&"createProjectionLayer"in XRWebGLBinding.prototype){let xe=null,Pe=null,me=null;T.depth&&(me=T.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,xe=T.stencil?bn:Qi,Pe=T.stencil?Ls:Fi);const Fe={colorFormat:t.RGBA8,depthFormat:me,scaleFactor:s};d=this.getBinding(),u=d.createProjectionLayer(Fe),n.updateRenderState({layers:[u]}),e.setPixelRatio(1),e.setSize(u.textureWidth,u.textureHeight,!1),S=new vi(u.textureWidth,u.textureHeight,{format:ci,type:ti,depthTexture:new Ns(u.textureWidth,u.textureHeight,Pe,void 0,void 0,void 0,void 0,void 0,void 0,xe),stencilBuffer:T.stencil,colorSpace:e.outputColorSpace,samples:T.antialias?4:0,resolveDepthBuffer:u.ignoreDepthValues===!1,resolveStencilBuffer:u.ignoreDepthValues===!1,storeMultisampledDepthBuffer:u.ignoreDepthValues===!1,storeMultisampledStencilBuffer:u.ignoreDepthValues===!1})}else{const xe={antialias:T.antialias,alpha:!0,depth:T.depth,stencil:T.stencil,framebufferScaleFactor:s};f=new XRWebGLLayer(n,t,xe),n.updateRenderState({baseLayer:f}),e.setPixelRatio(1),e.setSize(f.framebufferWidth,f.framebufferHeight,!1),S=new vi(f.framebufferWidth,f.framebufferHeight,{format:ci,type:ti,colorSpace:e.outputColorSpace,stencilBuffer:T.stencil,resolveDepthBuffer:f.ignoreDepthValues===!1,resolveStencilBuffer:f.ignoreDepthValues===!1,storeMultisampledDepthBuffer:f.ignoreDepthValues===!1,storeMultisampledStencilBuffer:f.ignoreDepthValues===!1})}S.isXRRenderTarget=!0,this.setFoveation(l),c=null,a=await n.requestReferenceSpace(o),je.setContext(n),je.start(),i.isPresenting=!0,i.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(n!==null)return n.environmentBlendMode},this.getDepthTexture=function(){return p.getDepthTexture()};function ne(Y){for(let Q=0;Q<Y.removed.length;Q++){const xe=Y.removed[Q],Pe=E.indexOf(xe);Pe>=0&&(E[Pe]=null,M[Pe].disconnect(xe))}for(let Q=0;Q<Y.added.length;Q++){const xe=Y.added[Q];let Pe=E.indexOf(xe);if(Pe===-1){for(let Fe=0;Fe<M.length;Fe++)if(Fe>=E.length){E.push(xe),Pe=Fe;break}else if(E[Fe]===null){E[Fe]=xe,Pe=Fe;break}if(Pe===-1)break}const me=M[Pe];me&&me.connect(xe)}}const q=new z,ee=new z;function ie(Y,Q,xe){q.setFromMatrixPosition(Q.matrixWorld),ee.setFromMatrixPosition(xe.matrixWorld);const Pe=q.distanceTo(ee),me=Q.projectionMatrix.elements,Fe=xe.projectionMatrix.elements,Tt=me[14]/(me[10]-1),Oe=me[14]/(me[10]+1),$e=(me[9]+1)/me[5],ct=(me[9]-1)/me[5],ke=(me[8]-1)/me[0],pt=(Fe[8]+1)/Fe[0],Rt=Tt*ke,Gt=Tt*pt,mt=Pe/(-ke+pt),St=mt*-ke;if(Q.matrixWorld.decompose(Y.position,Y.quaternion,Y.scale),Y.translateX(St),Y.translateZ(mt),Y.matrixWorld.compose(Y.position,Y.quaternion,Y.scale),Y.matrixWorldInverse.copy(Y.matrixWorld).invert(),me[10]===-1)Y.projectionMatrix.copy(Q.projectionMatrix),Y.projectionMatrixInverse.copy(Q.projectionMatrixInverse);else{const L=Tt+mt,Nt=Oe+mt,et=Rt-St,b=Gt+(Pe-St),x=$e*Oe/Nt*L,F=ct*Oe/Nt*L;Y.projectionMatrix.makePerspective(et,b,x,F,L,Nt),Y.projectionMatrixInverse.copy(Y.projectionMatrix).invert()}}function Ae(Y,Q){Q===null?Y.matrixWorld.copy(Y.matrix):Y.matrixWorld.multiplyMatrices(Q.matrixWorld,Y.matrix),Y.matrixWorldInverse.copy(Y.matrixWorld).invert()}this.updateCamera=function(Y){if(n===null)return;let Q=Y.near,xe=Y.far;p.texture!==null&&(p.depthNear>0&&(Q=p.depthNear),p.depthFar>0&&(xe=p.depthFar)),B.near=P.near=R.near=Q,B.far=P.far=R.far=xe,(N!==B.near||H!==B.far)&&(n.updateRenderState({depthNear:B.near,depthFar:B.far}),N=B.near,H=B.far),B.layers.mask=Y.layers.mask|6,R.layers.mask=B.layers.mask&-5,P.layers.mask=B.layers.mask&-3;const Pe=Y.parent,me=B.cameras;Ae(B,Pe);for(let Fe=0;Fe<me.length;Fe++)Ae(me[Fe],Pe);me.length===2?ie(B,R,P):B.projectionMatrix.copy(R.projectionMatrix),w===null&&Y.isPerspectiveCamera&&(w={camera:Y,fov:Y.fov,zoom:Y.zoom}),Te(Y,B,Pe)};function Te(Y,Q,xe){xe===null?Y.matrix.copy(Q.matrixWorld):(Y.matrix.copy(xe.matrixWorld),Y.matrix.invert(),Y.matrix.multiply(Q.matrixWorld)),Y.matrix.decompose(Y.position,Y.quaternion,Y.scale),Y.updateMatrixWorld(!0),Y.projectionMatrix.copy(Q.projectionMatrix),Y.projectionMatrixInverse.copy(Q.projectionMatrixInverse),Y.isPerspectiveCamera&&(Y.fov=qo*2*Math.atan(1/Y.projectionMatrix.elements[5]),Y.zoom=1)}this.getCamera=function(){return B},this.getFoveation=function(){if(!(u===null&&f===null))return l},this.setFoveation=function(Y){l=Y,u!==null&&(u.fixedFoveation=Y),f!==null&&f.fixedFoveation!==void 0&&(f.fixedFoveation=Y)},this.hasDepthSensing=function(){return p.texture!==null},this.getDepthSensingMesh=function(){return p.getMesh(B)},this.getCameraTexture=function(Y){return _[Y]};let lt=null;function qe(Y,Q){if(h=Q.getViewerPose(c||a),m=Q,h!==null){const xe=h.views;f!==null&&(e.setRenderTargetFramebuffer(S,f.framebuffer),e.setRenderTarget(S));let Pe=!1;xe.length!==B.cameras.length&&(B.cameras.length=0,Pe=!0);for(let Oe=0;Oe<xe.length;Oe++){const $e=xe[Oe];let ct=null;if(f!==null)ct=f.getViewport($e);else{const pt=d.getViewSubImage(u,$e);ct=pt.viewport,Oe===0&&(e.setRenderTargetTextures(S,pt.colorTexture,pt.depthStencilTexture),e.setRenderTarget(S))}let ke=O[Oe];ke===void 0&&(ke=new mi,ke.layers.enable(Oe),ke.viewport=new xt,O[Oe]=ke),ke.matrix.fromArray($e.transform.matrix),ke.matrix.decompose(ke.position,ke.quaternion,ke.scale),ke.projectionMatrix.fromArray($e.projectionMatrix),ke.projectionMatrixInverse.copy(ke.projectionMatrix).invert(),ke.viewport.set(ct.x,ct.y,ct.width,ct.height),Oe===0&&(B.matrix.copy(ke.matrix),B.matrix.decompose(B.position,B.quaternion,B.scale)),Pe===!0&&B.cameras.push(ke)}const me=n.enabledFeatures;if(me&&me.includes("depth-sensing")&&n.depthUsage=="gpu-optimized"&&y){d=i.getBinding();const Oe=d.getDepthInformation(xe[0]);Oe&&Oe.isValid&&Oe.texture&&p.init(Oe,n.renderState)}if(me&&me.includes("camera-access")&&y){e.state.unbindTexture(),d=i.getBinding();for(let Oe=0;Oe<xe.length;Oe++){const $e=xe[Oe].camera;if($e){let ct=_[$e];ct||(ct=new Hu,_[$e]=ct);const ke=d.getCameraImage($e);ct.sourceTexture=ke}}}}for(let xe=0;xe<M.length;xe++){const Pe=E[xe],me=M[xe];Pe!==null&&me!==void 0&&me.update(Pe,Q,c||a)}lt&&lt(Y,Q),Q.detectedPlanes&&i.dispatchEvent({type:"planesdetected",data:Q}),m=null}const je=new Wu;je.setAnimationLoop(qe),this.setAnimationLoop=function(Y){lt=Y},this.dispose=function(){}}}const B0=new wt,ju=new Ie;ju.set(-1,0,0,0,1,0,0,0,1);function H0(r,e){function t(p,_){p.matrixAutoUpdate===!0&&p.updateMatrix(),_.value.copy(p.matrix)}function i(p,_){_.color.getRGB(p.fogColor.value,Gu(r)),_.isFog?(p.fogNear.value=_.near,p.fogFar.value=_.far):_.isFogExp2&&(p.fogDensity.value=_.density)}function n(p,_,T,A,S){_.isNodeMaterial?_.uniformsNeedUpdate=!1:_.isMeshBasicMaterial?s(p,_):_.isMeshLambertMaterial?(s(p,_),_.envMap&&(p.envMapIntensity.value=_.envMapIntensity)):_.isMeshToonMaterial?(s(p,_),d(p,_)):_.isMeshPhongMaterial?(s(p,_),h(p,_),_.envMap&&(p.envMapIntensity.value=_.envMapIntensity)):_.isMeshStandardMaterial?(s(p,_),u(p,_),_.isMeshPhysicalMaterial&&f(p,_,S)):_.isMeshMatcapMaterial?(s(p,_),m(p,_)):_.isMeshDepthMaterial?s(p,_):_.isMeshDistanceMaterial?(s(p,_),y(p,_)):_.isMeshNormalMaterial?s(p,_):_.isLineBasicMaterial?(a(p,_),_.isLineDashedMaterial&&o(p,_)):_.isPointsMaterial?l(p,_,T,A):_.isSpriteMaterial?c(p,_):_.isShadowMaterial?(p.color.value.copy(_.color),p.opacity.value=_.opacity):_.isShaderMaterial&&(_.uniformsNeedUpdate=!1)}function s(p,_){p.opacity.value=_.opacity,_.color&&p.diffuse.value.copy(_.color),_.emissive&&p.emissive.value.copy(_.emissive).multiplyScalar(_.emissiveIntensity),_.map&&(p.map.value=_.map,t(_.map,p.mapTransform)),_.alphaMap&&(p.alphaMap.value=_.alphaMap,t(_.alphaMap,p.alphaMapTransform)),_.bumpMap&&(p.bumpMap.value=_.bumpMap,t(_.bumpMap,p.bumpMapTransform),p.bumpScale.value=_.bumpScale,_.side===qt&&(p.bumpScale.value*=-1)),_.normalMap&&(p.normalMap.value=_.normalMap,t(_.normalMap,p.normalMapTransform),p.normalScale.value.copy(_.normalScale),_.side===qt&&p.normalScale.value.negate()),_.displacementMap&&(p.displacementMap.value=_.displacementMap,t(_.displacementMap,p.displacementMapTransform),p.displacementScale.value=_.displacementScale,p.displacementBias.value=_.displacementBias),_.emissiveMap&&(p.emissiveMap.value=_.emissiveMap,t(_.emissiveMap,p.emissiveMapTransform)),_.specularMap&&(p.specularMap.value=_.specularMap,t(_.specularMap,p.specularMapTransform)),_.alphaTest>0&&(p.alphaTest.value=_.alphaTest);const T=e.get(_),A=T.envMap,S=T.envMapRotation;A&&(p.envMap.value=A,p.envMapRotation.value.setFromMatrix4(B0.makeRotationFromEuler(S)).transpose(),A.isCubeTexture&&A.isRenderTargetTexture===!1&&p.envMapRotation.value.premultiply(ju),p.reflectivity.value=_.reflectivity,p.ior.value=_.ior,p.refractionRatio.value=_.refractionRatio),_.lightMap&&(p.lightMap.value=_.lightMap,p.lightMapIntensity.value=_.lightMapIntensity,t(_.lightMap,p.lightMapTransform)),_.aoMap&&(p.aoMap.value=_.aoMap,p.aoMapIntensity.value=_.aoMapIntensity,t(_.aoMap,p.aoMapTransform))}function a(p,_){p.diffuse.value.copy(_.color),p.opacity.value=_.opacity,_.map&&(p.map.value=_.map,t(_.map,p.mapTransform))}function o(p,_){p.dashSize.value=_.dashSize,p.totalSize.value=_.dashSize+_.gapSize,p.scale.value=_.scale}function l(p,_,T,A){p.diffuse.value.copy(_.color),p.opacity.value=_.opacity,p.size.value=_.size*T,p.scale.value=A*.5,_.map&&(p.map.value=_.map,t(_.map,p.uvTransform)),_.alphaMap&&(p.alphaMap.value=_.alphaMap,t(_.alphaMap,p.alphaMapTransform)),_.alphaTest>0&&(p.alphaTest.value=_.alphaTest)}function c(p,_){p.diffuse.value.copy(_.color),p.opacity.value=_.opacity,p.rotation.value=_.rotation,_.map&&(p.map.value=_.map,t(_.map,p.mapTransform)),_.alphaMap&&(p.alphaMap.value=_.alphaMap,t(_.alphaMap,p.alphaMapTransform)),_.alphaTest>0&&(p.alphaTest.value=_.alphaTest)}function h(p,_){p.specular.value.copy(_.specular),p.shininess.value=Math.max(_.shininess,1e-4)}function d(p,_){_.gradientMap&&(p.gradientMap.value=_.gradientMap)}function u(p,_){p.metalness.value=_.metalness,_.metalnessMap&&(p.metalnessMap.value=_.metalnessMap,t(_.metalnessMap,p.metalnessMapTransform)),p.roughness.value=_.roughness,_.roughnessMap&&(p.roughnessMap.value=_.roughnessMap,t(_.roughnessMap,p.roughnessMapTransform)),_.envMap&&(p.envMapIntensity.value=_.envMapIntensity)}function f(p,_,T){p.ior.value=_.ior,_.sheen>0&&(p.sheenColor.value.copy(_.sheenColor).multiplyScalar(_.sheen),p.sheenRoughness.value=_.sheenRoughness,_.sheenColorMap&&(p.sheenColorMap.value=_.sheenColorMap,t(_.sheenColorMap,p.sheenColorMapTransform)),_.sheenRoughnessMap&&(p.sheenRoughnessMap.value=_.sheenRoughnessMap,t(_.sheenRoughnessMap,p.sheenRoughnessMapTransform))),_.clearcoat>0&&(p.clearcoat.value=_.clearcoat,p.clearcoatRoughness.value=_.clearcoatRoughness,_.clearcoatMap&&(p.clearcoatMap.value=_.clearcoatMap,t(_.clearcoatMap,p.clearcoatMapTransform)),_.clearcoatRoughnessMap&&(p.clearcoatRoughnessMap.value=_.clearcoatRoughnessMap,t(_.clearcoatRoughnessMap,p.clearcoatRoughnessMapTransform)),_.clearcoatNormalMap&&(p.clearcoatNormalMap.value=_.clearcoatNormalMap,t(_.clearcoatNormalMap,p.clearcoatNormalMapTransform),p.clearcoatNormalScale.value.copy(_.clearcoatNormalScale),_.side===qt&&p.clearcoatNormalScale.value.negate())),_.dispersion>0&&(p.dispersion.value=_.dispersion),_.retroreflectivity>0&&(p.retroreflectivity.value=_.retroreflectivity),_.iridescence>0&&(p.iridescence.value=_.iridescence,p.iridescenceIOR.value=_.iridescenceIOR,p.iridescenceThicknessMinimum.value=_.iridescenceThicknessRange[0],p.iridescenceThicknessMaximum.value=_.iridescenceThicknessRange[1],_.iridescenceMap&&(p.iridescenceMap.value=_.iridescenceMap,t(_.iridescenceMap,p.iridescenceMapTransform)),_.iridescenceThicknessMap&&(p.iridescenceThicknessMap.value=_.iridescenceThicknessMap,t(_.iridescenceThicknessMap,p.iridescenceThicknessMapTransform))),_.transmission>0&&(p.transmission.value=_.transmission,p.transmissionSamplerMap.value=T.texture,p.transmissionSamplerSize.value.set(T.width,T.height),_.transmissionMap&&(p.transmissionMap.value=_.transmissionMap,t(_.transmissionMap,p.transmissionMapTransform)),p.thickness.value=_.thickness,_.thicknessMap&&(p.thicknessMap.value=_.thicknessMap,t(_.thicknessMap,p.thicknessMapTransform)),p.attenuationDistance.value=_.attenuationDistance,p.attenuationColor.value.copy(_.attenuationColor)),_.anisotropy>0&&(p.anisotropyVector.value.set(_.anisotropy*Math.cos(_.anisotropyRotation),_.anisotropy*Math.sin(_.anisotropyRotation)),_.anisotropyMap&&(p.anisotropyMap.value=_.anisotropyMap,t(_.anisotropyMap,p.anisotropyMapTransform))),p.specularIntensity.value=_.specularIntensity,p.specularColor.value.copy(_.specularColor),_.specularColorMap&&(p.specularColorMap.value=_.specularColorMap,t(_.specularColorMap,p.specularColorMapTransform)),_.specularIntensityMap&&(p.specularIntensityMap.value=_.specularIntensityMap,t(_.specularIntensityMap,p.specularIntensityMapTransform))}function m(p,_){_.matcap&&(p.matcap.value=_.matcap)}function y(p,_){const T=e.get(_).light;p.referencePosition.value.setFromMatrixPosition(T.matrixWorld),p.nearDistance.value=T.shadow.camera.near,p.farDistance.value=T.shadow.camera.far}return{refreshFogUniforms:i,refreshMaterialUniforms:n}}function G0(r,e,t,i){let n={},s={},a=[];const o=r.getParameter(r.MAX_UNIFORM_BUFFER_BINDINGS);function l(S,M){const E=M.program;i.uniformBlockBinding(S,E)}function c(S,M){let E=n[S.id];E===void 0&&(p(S),E=h(S),n[S.id]=E,S.addEventListener("dispose",T));const C=M.program;i.updateUBOMapping(S,C);const g=e.render.frame;s[S.id]!==g&&(u(S),s[S.id]=g)}function h(S){const M=d();S.__bindingPointIndex=M;const E=r.createBuffer(),C=S.__size,g=S.usage;return r.bindBuffer(r.UNIFORM_BUFFER,E),r.bufferData(r.UNIFORM_BUFFER,C,g),r.bindBuffer(r.UNIFORM_BUFFER,null),r.bindBufferBase(r.UNIFORM_BUFFER,M,E),E}function d(){for(let S=0;S<o;S++)if(a.indexOf(S)===-1)return a.push(S),S;return Ke("WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function u(S){const M=n[S.id],E=S.uniforms,C=S.__cache;r.bindBuffer(r.UNIFORM_BUFFER,M);for(let g=0,w=E.length;g<w;g++){const R=E[g];if(Array.isArray(R))for(let P=0,O=R.length;P<O;P++)f(R[P],g,P,C);else f(R,g,0,C)}r.bindBuffer(r.UNIFORM_BUFFER,null)}function f(S,M,E,C){if(y(S,M,E,C)===!0){const g=S.__offset,w=S.value;if(Array.isArray(w)){let R=0;for(let P=0;P<w.length;P++){const O=w[P],B=_(O);m(O,S.__data,R),typeof O!="number"&&typeof O!="boolean"&&!O.isMatrix3&&!ArrayBuffer.isView(O)&&(R+=B.storage/Float32Array.BYTES_PER_ELEMENT)}}else m(w,S.__data,0);r.bufferSubData(r.UNIFORM_BUFFER,g,S.__data)}}function m(S,M,E){typeof S=="number"||typeof S=="boolean"?M[0]=S:S.isMatrix3?(M[0]=S.elements[0],M[1]=S.elements[1],M[2]=S.elements[2],M[3]=0,M[4]=S.elements[3],M[5]=S.elements[4],M[6]=S.elements[5],M[7]=0,M[8]=S.elements[6],M[9]=S.elements[7],M[10]=S.elements[8],M[11]=0):ArrayBuffer.isView(S)?M.set(new S.constructor(S.buffer,S.byteOffset,M.length)):S.toArray(M,E)}function y(S,M,E,C){const g=S.value,w=M+"_"+E;if(C[w]===void 0)return typeof g=="number"||typeof g=="boolean"?C[w]=g:ArrayBuffer.isView(g)?C[w]=g.slice():C[w]=g.clone(),!0;{const R=C[w];if(typeof g=="number"||typeof g=="boolean"){if(R!==g)return C[w]=g,!0}else{if(ArrayBuffer.isView(g))return!0;if(R.equals(g)===!1)return R.copy(g),!0}}return!1}function p(S){const M=S.uniforms;let E=0;const C=16;for(let w=0,R=M.length;w<R;w++){const P=Array.isArray(M[w])?M[w]:[M[w]];for(let O=0,B=P.length;O<B;O++){const N=P[O],H=Array.isArray(N.value)?N.value:[N.value];for(let J=0,V=H.length;J<V;J++){const ne=H[J],q=_(ne),ee=E%C,ie=ee%q.boundary,Ae=ee+ie;E+=ie,Ae!==0&&C-Ae<q.storage&&(E+=C-Ae),N.__data=new Float32Array(q.storage/Float32Array.BYTES_PER_ELEMENT),N.__offset=E,E+=q.storage}}}const g=E%C;return g>0&&(E+=C-g),S.__size=E,S.__cache={},this}function _(S){const M={boundary:0,storage:0};return typeof S=="number"||typeof S=="boolean"?(M.boundary=4,M.storage=4):S.isVector2?(M.boundary=8,M.storage=8):S.isVector3||S.isColor?(M.boundary=16,M.storage=12):S.isVector4?(M.boundary=16,M.storage=16):S.isMatrix3?(M.boundary=48,M.storage=48):S.isMatrix4?(M.boundary=64,M.storage=64):S.isTexture?Re("WebGLRenderer: Texture samplers can not be part of an uniforms group."):ArrayBuffer.isView(S)?(M.boundary=16,M.storage=S.byteLength):Re("WebGLRenderer: Unsupported uniform value type.",S),M}function T(S){const M=S.target;M.removeEventListener("dispose",T);const E=a.indexOf(M.__bindingPointIndex);a.splice(E,1),r.deleteBuffer(n[M.id]),delete n[M.id],delete s[M.id]}function A(){for(const S in n)r.deleteBuffer(n[S]);a=[],n={},s={}}return{bind:l,update:c,dispose:A}}const z0=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]);let Ti=null;function W0(){return Ti===null&&(Ti=new Uu(z0,16,16,Pn,Oi),Ti.name="DFG_LUT",Ti.minFilter=Dt,Ti.magFilter=Dt,Ti.wrapS=ii,Ti.wrapT=ii,Ti.generateMipmaps=!1,Ti.needsUpdate=!0),Ti}class V0{constructor(e={}){const{canvas:t=cf(),context:i=null,depth:n=!0,stencil:s=!1,alpha:a=!1,antialias:o=!1,premultipliedAlpha:l=!0,preserveDrawingBuffer:c=!1,powerPreference:h="default",failIfMajorPerformanceCaveat:d=!1,reversedDepthBuffer:u=!1,outputBufferType:f=ti}=e;this.isWebGLRenderer=!0;let m;if(i!==null){if(typeof WebGLRenderingContext<"u"&&i instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");m=i.getContextAttributes().alpha}else m=a;const y=f,p=new Set([tl,el,Qo]),_=new Set([ti,Fi,Ds,Ls,Jo,Zo]),T=new Uint32Array(4),A=new Int32Array(4),S=new z;let M=null,E=null;const C=[],g=[];let w=null;this.domElement=t,this.debug={checkShaderErrors:!0,diagnostics:{keywords:!1},onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=Ni,this.toneMappingExposure=1,this.transmissionResolutionScale=1;const R=this;let P=!1,O=null,B=null,N=null,H=null;this._outputColorSpace=oi;let J=0,V=0,ne=null,q=-1,ee=null;const ie=new xt,Ae=new xt;let Te=null;const lt=new Xe(0);let qe=0,je=t.width,Y=t.height,Q=1,xe=null,Pe=null;const me=new xt(0,0,je,Y),Fe=new xt(0,0,je,Y);let Tt=!1;const Oe=new ku;let $e=!1,ct=!1;const ke=new wt,pt=new z,Rt=new xt,Gt={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0};let mt=!1;function St(){return ne===null?Q:1}let L=i;function Nt(v,I){return t.getContext(v,I)}let et,b,x,F,G,X,se,re,$,j,ae,Ee,he,oe,we,Ce,De,D,le,K,ce,pe,te;try{const v={alpha:!0,depth:n,stencil:s,antialias:o,premultipliedAlpha:l,preserveDrawingBuffer:c,powerPreference:h,failIfMajorPerformanceCaveat:d};if("setAttribute"in t&&t.setAttribute("data-engine",`three.js r${Ko}`),t.addEventListener("webglcontextlost",ht,!1),t.addEventListener("webglcontextrestored",Je,!1),t.addEventListener("webglcontextcreationerror",hi,!1),L===null){const I="webgl2";if(L=Nt(I,v),L===null)throw Nt(I)?new Error("THREE.WebGLRenderer: Error creating WebGL context with your selected attributes."):new Error("THREE.WebGLRenderer: Error creating WebGL context.")}be()}catch(v){throw t.removeEventListener("webglcontextlost",ht,!1),t.removeEventListener("webglcontextrestored",Je,!1),t.removeEventListener("webglcontextcreationerror",hi,!1),Ke("WebGLRenderer: "+v.message),v}function be(){et=new Wm(L),et.init(),ce=new N0(L,et),b=new Lm(L,et,e,ce),x=new D0(L,et),b.reversedDepthBuffer&&u&&x.buffers.depth.setReversed(!0),B=L.createFramebuffer(),N=L.createFramebuffer(),H=L.createFramebuffer(),F=new qm(L),G=new x0,X=new L0(L,et,x,G,b,ce,F),se=new zm(R),re=new $f(L),pe=new Im(L,re),$=new Vm(L,re,F,pe),j=new $m(L,$,re,pe,F),D=new Ym(L,b,X),we=new Nm(G),ae=new g0(R,se,et,b,pe,we),Ee=new H0(R,G),he=new v0,oe=new b0(et),De=new Pm(R,se,x,j,m,l),Ce=new I0(R,j,b),te=new G0(L,F,b,x),le=new Dm(L,et,F),K=new Xm(L,et,F),F.programs=ae.programs,R.capabilities=b,R.extensions=et,R.properties=G,R.renderLists=he,R.shadowMap=Ce,R.state=x,R.info=F}y!==ti&&(w=new jm(y,t.width,t.height,o,n,s));const Se=new k0(R,L);this.xr=Se,this.getContext=function(){return L},this.getContextAttributes=function(){return L.getContextAttributes()},this.forceContextLoss=function(){const v=et.get("WEBGL_lose_context");v&&v.loseContext()},this.forceContextRestore=function(){const v=et.get("WEBGL_lose_context");v&&v.restoreContext()},this.getPixelRatio=function(){return Q},this.setPixelRatio=function(v){v!==void 0&&(Q=v,this.setSize(je,Y,!1))},this.getSize=function(v){return v.set(je,Y)},this.setSize=function(v,I,W=!0){if(Se.isPresenting){Re("WebGLRenderer: Can't change size while VR device is presenting.");return}je=v,Y=I,t.width=Math.floor(v*Q),t.height=Math.floor(I*Q),W===!0&&(t.style.width=v+"px",t.style.height=I+"px"),w!==null&&w.setSize(t.width,t.height),this.setViewport(0,0,v,I)},this.getDrawingBufferSize=function(v){return v.set(je*Q,Y*Q).floor()},this.setDrawingBufferSize=function(v,I,W){je=v,Y=I,Q=W,t.width=Math.floor(v*W),t.height=Math.floor(I*W),this.setViewport(0,0,v,I)},this.setEffects=function(v){if(y===ti){Ke("WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.");return}if(v){for(let I=0;I<v.length;I++)if(v[I].isOutputPass===!0){Re("WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.");break}}w.setEffects(v||[])},this.getCurrentViewport=function(v){return v.copy(ie)},this.getViewport=function(v){return v.copy(me)},this.setViewport=function(v,I,W,U){v.isVector4?me.set(v.x,v.y,v.z,v.w):me.set(v,I,W,U),x.viewport(ie.copy(me).multiplyScalar(Q).round())},this.getScissor=function(v){return v.copy(Fe)},this.setScissor=function(v,I,W,U){v.isVector4?Fe.set(v.x,v.y,v.z,v.w):Fe.set(v,I,W,U),x.scissor(Ae.copy(Fe).multiplyScalar(Q).round())},this.getScissorTest=function(){return Tt},this.setScissorTest=function(v){x.setScissorTest(Tt=v)},this.setOpaqueSort=function(v){xe=v},this.setTransparentSort=function(v){Pe=v},this.getClearColor=function(v){return v.copy(De.getClearColor())},this.setClearColor=function(){De.setClearColor(...arguments)},this.getClearAlpha=function(){return De.getClearAlpha()},this.setClearAlpha=function(){De.setClearAlpha(...arguments)},this.clear=function(v=!0,I=!0,W=!0){let U=0;if(v){let k=!1;if(ne!==null){const fe=ne.texture.format;k=p.has(fe)}if(k){const fe=ne.texture.type,ge=_.has(fe),de=De.getClearColor(),ye=De.getClearAlpha(),Me=de.r,Le=de.g,Ue=de.b;ge?(T[0]=Me,T[1]=Le,T[2]=Ue,T[3]=ye,L.clearBufferuiv(L.COLOR,0,T)):(A[0]=Me,A[1]=Le,A[2]=Ue,A[3]=ye,L.clearBufferiv(L.COLOR,0,A))}else U|=L.COLOR_BUFFER_BIT}I&&(U|=L.DEPTH_BUFFER_BIT,this.state.buffers.depth.setMask(!0)),W&&(U|=L.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),U!==0&&L.clear(U)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.setNodesHandler=function(v){v.setRenderer(this),O=v},this.dispose=function(){t.removeEventListener("webglcontextlost",ht,!1),t.removeEventListener("webglcontextrestored",Je,!1),t.removeEventListener("webglcontextcreationerror",hi,!1),De.dispose(),he.dispose(),oe.dispose(),G.dispose(),se.dispose(),j.dispose(),pe.dispose(),te.dispose(),ae.dispose(),Se.dispose(),Se.removeEventListener("sessionstart",pl),Se.removeEventListener("sessionend",_l),mn.stop()};function ht(v){v.preventDefault(),Wl("WebGLRenderer: Context Lost."),P=!0}function Je(){Wl("WebGLRenderer: Context Restored."),P=!1;const v=F.autoReset,I=Ce.enabled,W=Ce.autoUpdate,U=Ce.needsUpdate,k=Ce.type;be(),F.autoReset=v,Ce.enabled=I,Ce.autoUpdate=W,Ce.needsUpdate=U,Ce.type=k}function hi(v){Ke("WebGLRenderer: A WebGL context could not be created. Reason: ",v.statusMessage)}function Mi(v){const I=v.target;I.removeEventListener("dispose",Mi),nd(I)}function nd(v){sd(v),G.remove(v)}function sd(v){const I=G.get(v).programs;I!==void 0&&(I.forEach(function(W){ae.releaseProgram(W)}),v.isShaderMaterial&&ae.releaseShaderCache(v))}this.renderBufferDirect=function(v,I,W,U,k,fe){I===null&&(I=Gt);const ge=k.isMesh&&k.matrixWorld.determinantAffine()<0,de=od(v,I,W,U,k);x.setMaterial(U,ge);let ye=W.index,Me=1;if(U.wireframe===!0){if(ye=$.getWireframeAttribute(W),ye===void 0)return;Me=2}const Le=W.drawRange,Ue=W.attributes.position;let ve=Le.start*Me,Ze=(Le.start+Le.count)*Me;fe!==null&&(ve=Math.max(ve,fe.start*Me),Ze=Math.min(Ze,(fe.start+fe.count)*Me)),ye!==null?(ve=Math.max(ve,0),Ze=Math.min(Ze,ye.count)):Ue!=null&&(ve=Math.max(ve,0),Ze=Math.min(Ze,Ue.count));const Mt=Ze-ve;if(Mt<0||Mt===1/0)return;pe.setup(k,U,de,W,ye);let dt,at=le;if(ye!==null&&(dt=re.get(ye),at=K,at.setIndex(dt)),k.isMesh)U.wireframe===!0?(x.setLineWidth(U.wireframeLinewidth*St()),at.setMode(L.LINES)):at.setMode(L.TRIANGLES);else if(k.isLine){let Ft=U.linewidth;Ft===void 0&&(Ft=1),x.setLineWidth(Ft*St()),k.isLineSegments?at.setMode(L.LINES):k.isLineLoop?at.setMode(L.LINE_LOOP):at.setMode(L.LINE_STRIP)}else k.isPoints?at.setMode(L.POINTS):k.isSprite&&at.setMode(L.TRIANGLES);if(k.isBatchedMesh)if(et.get("WEBGL_multi_draw"))at.renderMultiDraw(k._multiDrawStarts,k._multiDrawCounts,k._multiDrawCount);else{const Ft=k._multiDrawStarts,_e=k._multiDrawCounts,Bt=k._multiDrawCount,Ye=ye?re.get(ye).bytesPerElement:1,si=G.get(U).currentProgram.getUniforms();for(let Ei=0;Ei<Bt;Ei++)si.setValue(L,"_gl_DrawID",Ei),at.render(Ft[Ei]/Ye,_e[Ei])}else if(k.isInstancedMesh)at.renderInstances(ve,Mt,k.count);else if(W.isInstancedBufferGeometry){const Ft=W._maxInstanceCount!==void 0?W._maxInstanceCount:1/0,_e=Math.min(W.instanceCount,Ft);at.renderInstances(ve,Mt,_e)}else at.render(ve,Mt)};function fl(v,I,W,U){O!==null&&v.isNodeMaterial&&O.setObject(U,v),$e===!0&&we.setState(v,W,!1),v.transparent===!0&&v.side===Yi&&v.forceSinglePass===!1?(v.side=qt,v.needsUpdate=!0,Gs(v,I,U),v.side=Cn,v.needsUpdate=!0,Gs(v,I,U),v.side=Yi):Gs(v,I,U)}this.compile=function(v,I,W=null){W===null&&(W=v),O!==null&&O.renderStart(v,I,W),E=oe.get(W),E.init(I),g.push(E),W.traverseVisible(function(k){k.isLight&&k.layers.test(I.layers)&&(E.pushLight(k),k.castShadow&&E.pushShadow(k))}),v!==W&&v.traverseVisible(function(k){k.isLight&&k.layers.test(I.layers)&&(E.pushLight(k),k.castShadow&&E.pushShadow(k))}),E.setupLights(),O!==null&&O.updateLights(E.state.lightsArray),ct=this.localClippingEnabled,$e=we.init(this.clippingPlanes,ct),$e===!0&&we.setGlobalState(this.clippingPlanes,I),O!==null&&Ce.render(E.state.shadowsArray,W,I);const U=new Set;return v.traverse(function(k){if(!(k.isMesh||k.isPoints||k.isLine||k.isSprite))return;const fe=k.material;if(fe)if(Array.isArray(fe))for(let ge=0;ge<fe.length;ge++){const de=fe[ge];fl(de,W,I,k),U.add(de)}else fl(fe,W,I,k),U.add(fe)}),E=g.pop(),O!==null&&O.renderEnd(),U},this.compileAsync=function(v,I,W=null){const U=this.compile(v,I,W);return new Promise(k=>{function fe(){if(U.forEach(function(ge){const ye=G.get(ge).currentProgram;(ye===void 0||ye.isReady())&&U.delete(ge)}),U.size===0){k(v);return}setTimeout(fe,10)}et.get("KHR_parallel_shader_compile")!==null?fe():setTimeout(fe,10)})};let ia=null;function rd(v){ia&&ia(v)}function pl(){mn.stop()}function _l(){mn.start()}const mn=new Wu;mn.setAnimationLoop(rd),typeof self<"u"&&mn.setContext(self),this.setAnimationLoop=function(v){ia=v,Se.setAnimationLoop(v),v===null?mn.stop():mn.start()},Se.addEventListener("sessionstart",pl),Se.addEventListener("sessionend",_l),this.render=function(v,I){if(I!==void 0&&I.isCamera!==!0){Ke("WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(P===!0)return;O!==null&&O.renderStart(v,I);const W=Se.enabled===!0&&Se.isPresenting===!0,U=w!==null&&(ne===null||W)&&w.begin(R,ne);if(v.matrixWorldAutoUpdate===!0&&v.updateMatrixWorld(),I.parent===null&&I.matrixWorldAutoUpdate===!0&&I.updateMatrixWorld(),Se.enabled===!0&&Se.isPresenting===!0&&(w===null||w.isCompositing()===!1)&&(Se.cameraAutoUpdate===!0&&Se.updateCamera(I),I=Se.getCamera()),v.isScene===!0&&v.onBeforeRender(R,v,I,ne),E=oe.get(v,g.length),E.init(I),E.state.textureUnits=X.getTextureUnits(),g.push(E),ke.multiplyMatrices(I.projectionMatrix,I.matrixWorldInverse),Oe.setFromProjectionMatrix(ke,Li,I.reversedDepth),ct=this.localClippingEnabled,$e=we.init(this.clippingPlanes,ct),M=he.get(v,C.length),M.init(),C.push(M),Se.enabled===!0&&Se.isPresenting===!0){const ge=R.xr.getDepthSensingMesh();ge!==null&&na(ge,I,-1/0,R.sortObjects)}na(v,I,0,R.sortObjects),M.finish(),O!==null&&O.updateLights(E.state.lightsArray),R.sortObjects===!0&&M.sort(xe,Pe),mt=Se.enabled===!1||Se.isPresenting===!1||Se.hasDepthSensing()===!1,mt&&De.addToRenderList(M,v),this.info.render.frame++,this.info.autoReset===!0&&this.info.reset(),$e===!0&&we.beginShadows();const k=E.state.shadowsArray;if(Ce.render(k,v,I),$e===!0&&we.endShadows(),(U&&w.hasRenderPass())===!1){const ge=M.opaque,de=M.transmissive;if(E.setupLights(),I.isArrayCamera){const ye=I.cameras;if(de.length>0)for(let Me=0,Le=ye.length;Me<Le;Me++){const Ue=ye[Me];gl(ge,de,v,Ue)}mt&&De.render(v);for(let Me=0,Le=ye.length;Me<Le;Me++){const Ue=ye[Me];ml(M,v,Ue,Ue.viewport)}}else de.length>0&&gl(ge,de,v,I),mt&&De.render(v),ml(M,v,I)}ne!==null&&V===0&&(X.updateMultisampleRenderTarget(ne),X.updateRenderTargetMipmap(ne)),U&&w.end(R),v.isScene===!0&&v.onAfterRender(R,v,I),pe.resetDefaultState(),q=-1,ee=null,g.pop(),g.length>0?(E=g[g.length-1],X.setTextureUnits(E.state.textureUnits),$e===!0&&we.setGlobalState(R.clippingPlanes,E.state.camera)):E=null,C.pop(),C.length>0?M=C[C.length-1]:M=null,O!==null&&O.renderEnd()};function na(v,I,W,U){if(v.visible===!1)return;if(v.layers.test(I.layers)){if(v.isGroup)W=v.renderOrder;else if(v.isLOD)v.autoUpdate===!0&&v.update(I);else if(v.isLightProbeGrid)E.pushLightProbeGrid(v);else if(v.isLight)E.pushLight(v),v.castShadow&&E.pushShadow(v);else if(v.isSprite){if(!v.frustumCulled||v.intersectsFrustum(Oe)){U&&Rt.setFromMatrixPosition(v.matrixWorld).applyMatrix4(ke);const ge=j.update(v),de=v.material;de.visible&&M.push(v,ge,de,W,Rt.z,null,I)}}else if((v.isMesh||v.isLine||v.isPoints)&&(!v.frustumCulled||v.intersectsFrustum(Oe))){const ge=j.update(v),de=v.material;if(U&&(v.boundingSphere!==void 0?(v.boundingSphere===null&&v.computeBoundingSphere(),Rt.copy(v.boundingSphere.center)):(ge.boundingSphere===null&&ge.computeBoundingSphere(),Rt.copy(ge.boundingSphere.center)),Rt.applyMatrix4(v.matrixWorld).applyMatrix4(ke)),Array.isArray(de)){const ye=ge.groups;for(let Me=0,Le=ye.length;Me<Le;Me++){const Ue=ye[Me],ve=de[Ue.materialIndex];ve&&ve.visible&&M.push(v,ge,ve,W,Rt.z,Ue,I)}}else de.visible&&M.push(v,ge,de,W,Rt.z,null,I)}}const fe=v.children;for(let ge=0,de=fe.length;ge<de;ge++)na(fe[ge],I,W,U)}function ml(v,I,W,U){const{opaque:k,transmissive:fe,transparent:ge}=v;E.setupLightsView(W),$e===!0&&we.setGlobalState(R.clippingPlanes,W),U&&x.viewport(ie.copy(U)),k.length>0&&Hs(k,I,W),fe.length>0&&Hs(fe,I,W),ge.length>0&&Hs(ge,I,W),x.buffers.depth.setTest(!0),x.buffers.depth.setMask(!0),x.buffers.color.setMask(!0),x.setPolygonOffset(!1)}function gl(v,I,W,U){if((W.isScene===!0?W.overrideMaterial:null)!==null)return;if(E.state.transmissionRenderTarget[U.id]===void 0){const ve=et.has("EXT_color_buffer_half_float")||et.has("EXT_color_buffer_float");E.state.transmissionRenderTarget[U.id]=new vi(1,1,{generateMipmaps:!0,type:ve?Oi:ti,minFilter:Tn,samples:Math.max(4,b.samples),stencilBuffer:s,resolveDepthBuffer:!1,resolveStencilBuffer:!1,storeMultisampledDepthBuffer:!1,storeMultisampledStencilBuffer:!1,colorSpace:We.workingColorSpace})}const fe=E.state.transmissionRenderTarget[U.id],ge=U.viewport||ie;fe.setSize(ge.z*R.transmissionResolutionScale,ge.w*R.transmissionResolutionScale);const de=R.getRenderTarget(),ye=R.getActiveCubeFace(),Me=R.getActiveMipmapLevel();R.setRenderTarget(fe),R.getClearColor(lt),qe=R.getClearAlpha(),qe<1&&R.setClearColor(16777215,.5),R.clear(),mt&&De.render(W);const Le=R.toneMapping;R.toneMapping=Ni;const Ue=U.viewport;if(U.viewport!==void 0&&(U.viewport=void 0),E.setupLightsView(U),$e===!0&&we.setGlobalState(R.clippingPlanes,U),Hs(v,W,U),X.updateMultisampleRenderTarget(fe),X.updateRenderTargetMipmap(fe),et.has("WEBGL_multisampled_render_to_texture")===!1){let ve=!1;for(let Ze=0,Mt=I.length;Ze<Mt;Ze++){const dt=I[Ze],{object:at,geometry:Ft,material:_e,group:Bt}=dt;if(_e.side===Yi&&at.layers.test(U.layers)){const Ye=_e.side;_e.side=qt,_e.needsUpdate=!0,xl(at,W,U,Ft,_e,Bt),_e.side=Ye,_e.needsUpdate=!0,ve=!0}}ve===!0&&(X.updateMultisampleRenderTarget(fe),X.updateRenderTargetMipmap(fe))}R.setRenderTarget(de,ye,Me),R.setClearColor(lt,qe),Ue!==void 0&&(U.viewport=Ue),R.toneMapping=Le}function Hs(v,I,W){const U=I.isScene===!0?I.overrideMaterial:null;for(let k=0,fe=v.length;k<fe;k++){const ge=v[k],{object:de,geometry:ye,group:Me}=ge;let Le=ge.material;Le.allowOverride===!0&&U!==null&&(Le=U),de.layers.test(W.layers)&&xl(de,I,W,ye,Le,Me)}}function xl(v,I,W,U,k,fe){O!==null&&k.isNodeMaterial&&O.setObject(v,k),v.onBeforeRender(R,I,W,U,k,fe),v.modelViewMatrix.multiplyMatrices(W.matrixWorldInverse,v.matrixWorld),v.normalMatrix.getNormalMatrix(v.modelViewMatrix),k.onBeforeRender(R,I,W,U,v,fe),k.transparent===!0&&k.side===Yi&&k.forceSinglePass===!1?(k.side=qt,k.needsUpdate=!0,R.renderBufferDirect(W,I,U,k,v,fe),k.side=Cn,k.needsUpdate=!0,R.renderBufferDirect(W,I,U,k,v,fe),k.side=Yi):R.renderBufferDirect(W,I,U,k,v,fe),v.onAfterRender(R,I,W,U,k,fe)}function Gs(v,I,W){I.isScene!==!0&&(I=Gt);const U=G.get(v),k=E.state.lights,fe=E.state.shadowsArray,ge=k.state.version,de=ae.getParameters(v,k.state,fe,I,W,E.state.lightProbeGridArray),ye=ae.getProgramCacheKey(de);let Me=U.programs;U.environment=v.isMeshStandardMaterial||v.isMeshLambertMaterial||v.isMeshPhongMaterial?I.environment:null,U.fog=I.fog;const Le=v.isMeshStandardMaterial||v.isMeshLambertMaterial&&!v.envMap||v.isMeshPhongMaterial&&!v.envMap;U.envMap=se.get(v.envMap||U.environment,Le),U.envMapRotation=U.environment!==null&&v.envMap===null?I.environmentRotation:v.envMapRotation,Me===void 0&&(v.addEventListener("dispose",Mi),Me=new Map,U.programs=Me);let Ue=Me.get(ye);if(Ue!==void 0){if(U.currentProgram===Ue&&U.lightsStateVersion===ge)return vl(v,de),Ue}else de.uniforms=ae.getUniforms(v),O!==null&&v.isNodeMaterial&&O.build(v,W,de),v.onBeforeCompile(de,R),Ue=ae.acquireProgram(de,ye),Me.set(ye,Ue),U.uniforms=de.uniforms;const ve=U.uniforms;return(!v.isShaderMaterial&&!v.isRawShaderMaterial||v.clipping===!0)&&(ve.clippingPlanes=we.uniform),vl(v,de),U.needsLights=cd(v),U.lightsStateVersion=ge,U.needsLights&&(ve.ambientLightColor.value=k.state.ambient,ve.lightProbe.value=k.state.probe,ve.sunLights.value=k.state.sun,ve.sunLightShadows.value=k.state.sunShadow,ve.directionalLights.value=k.state.directional,ve.directionalLightShadows.value=k.state.directionalShadow,ve.spotLights.value=k.state.spot,ve.spotLightShadows.value=k.state.spotShadow,ve.rectAreaLights.value=k.state.rectArea,ve.ltc_1.value=k.state.rectAreaLTC1,ve.ltc_2.value=k.state.rectAreaLTC2,ve.pointLights.value=k.state.point,ve.pointLightShadows.value=k.state.pointShadow,ve.hemisphereLights.value=k.state.hemi,ve.sunShadowMatrix.value=k.state.sunShadowMatrix,ve.sunShadowCascade.value=k.state.sunShadowCascade,ve.directionalShadowMatrix.value=k.state.directionalShadowMatrix,ve.spotLightMatrix.value=k.state.spotLightMatrix,ve.spotLightMap.value=k.state.spotLightMap,ve.pointShadowMatrix.value=k.state.pointShadowMatrix),U.lightProbeGrid=E.state.lightProbeGridArray.length>0,U.currentProgram=Ue,U.uniformsList=null,Ue}function yl(v){if(v.uniformsList===null){const I=v.currentProgram.getUniforms();v.uniformsList=Fr.seqWithValue(I.seq,v.uniforms)}return v.uniformsList}function vl(v,I){const W=G.get(v);W.outputColorSpace=I.outputColorSpace,W.batching=I.batching,W.batchingColor=I.batchingColor,W.instancing=I.instancing,W.instancingColor=I.instancingColor,W.instancingMorph=I.instancingMorph,W.skinning=I.skinning,W.morphTargets=I.morphTargets,W.morphNormals=I.morphNormals,W.morphColors=I.morphColors,W.morphTargetsCount=I.morphTargetsCount,W.numClippingPlanes=I.numClippingPlanes,W.numIntersection=I.numClipIntersection,W.vertexAlphas=I.vertexAlphas,W.vertexTangents=I.vertexTangents,W.toneMapping=I.toneMapping}function ad(v,I){if(v.length===0)return null;if(v.length===1)return v[0].texture!==null?v[0]:null;S.setFromMatrixPosition(I.matrixWorld);for(let W=0,U=v.length;W<U;W++){const k=v[W];if(k.texture!==null&&k.boundingBox.containsPoint(S))return k}return null}function od(v,I,W,U,k){I.isScene!==!0&&(I=Gt),X.resetTextureUnits();const fe=I.fog,ge=U.isMeshStandardMaterial||U.isMeshLambertMaterial||U.isMeshPhongMaterial?I.environment:null,de=ne===null?R.outputColorSpace:ne.isXRRenderTarget===!0?ne.texture.colorSpace:We.workingColorSpace,ye=U.isMeshStandardMaterial||U.isMeshLambertMaterial&&!U.envMap||U.isMeshPhongMaterial&&!U.envMap,Me=se.get(U.envMap||ge,ye),Le=U.vertexColors===!0&&!!W.attributes.color&&W.attributes.color.itemSize===4,Ue=!!W.attributes.tangent&&(!!U.normalMap||U.anisotropy>0),ve=!!W.morphAttributes.position,Ze=!!W.morphAttributes.normal,Mt=!!W.morphAttributes.color;let dt=Ni;U.toneMapped&&(ne===null||ne.isXRRenderTarget===!0)&&(dt=R.toneMapping);const at=W.morphAttributes.position||W.morphAttributes.normal||W.morphAttributes.color,Ft=at!==void 0?at.length:0,_e=G.get(U),Bt=E.state.lights;if($e===!0&&(ct===!0||v!==ee)){const ut=v===ee&&U.id===q;we.setState(U,v,ut)}let Ye=!1;U.version===_e.__version?(_e.needsLights&&_e.lightsStateVersion!==Bt.state.version||_e.outputColorSpace!==de||k.isBatchedMesh&&_e.batching===!1||!k.isBatchedMesh&&_e.batching===!0||k.isBatchedMesh&&_e.batchingColor===!0&&k._colorsTexture===null||k.isBatchedMesh&&_e.batchingColor===!1&&k._colorsTexture!==null||k.isInstancedMesh&&_e.instancing===!1||!k.isInstancedMesh&&_e.instancing===!0||k.isSkinnedMesh&&_e.skinning===!1||!k.isSkinnedMesh&&_e.skinning===!0||k.isInstancedMesh&&_e.instancingColor===!0&&k.instanceColor===null||k.isInstancedMesh&&_e.instancingColor===!1&&k.instanceColor!==null||k.isInstancedMesh&&_e.instancingMorph===!0&&k.morphTexture===null||k.isInstancedMesh&&_e.instancingMorph===!1&&k.morphTexture!==null||_e.envMap!==Me||U.fog===!0&&_e.fog!==fe||_e.numClippingPlanes!==void 0&&(_e.numClippingPlanes!==we.numPlanes||_e.numIntersection!==we.numIntersection)||_e.vertexAlphas!==Le||_e.vertexTangents!==Ue||_e.morphTargets!==ve||_e.morphNormals!==Ze||_e.morphColors!==Mt||_e.toneMapping!==dt||_e.morphTargetsCount!==Ft||!!_e.lightProbeGrid!=E.state.lightProbeGridArray.length>0)&&(Ye=!0):(Ye=!0,_e.__version=U.version);let si=_e.currentProgram;Ye===!0&&(si=Gs(U,I,k),O&&U.isNodeMaterial&&O.onUpdateProgram(U,si,_e));let Ei=!1,tn=!1,Ln=!1;const st=si.getUniforms(),vt=_e.uniforms;if(x.useProgram(si.program)&&(Ei=!0,tn=!0,Ln=!0),U.id!==q&&(q=U.id,tn=!0),_e.needsLights){const ut=ad(E.state.lightProbeGridArray,k);_e.lightProbeGrid!==ut&&(_e.lightProbeGrid=ut,tn=!0)}if(Ei||ee!==v){x.buffers.depth.getReversed()&&v.reversedDepth!==!0&&(v._reversedDepth=!0,v.updateProjectionMatrix()),st.setValue(L,"projectionMatrix",v.projectionMatrix),st.setValue(L,"viewMatrix",v.matrixWorldInverse);const sn=st.map.cameraPosition;sn!==void 0&&sn.setValue(L,pt.setFromMatrixPosition(v.matrixWorld)),b.logarithmicDepthBuffer&&st.setValue(L,"logDepthBufFC",2/(Math.log(v.far+1)/Math.LN2)),(U.isMeshPhongMaterial||U.isMeshToonMaterial||U.isMeshLambertMaterial||U.isMeshBasicMaterial||U.isMeshStandardMaterial||U.isShaderMaterial)&&st.setValue(L,"isOrthographic",v.isOrthographicCamera===!0),ee!==v&&(ee=v,tn=!0,Ln=!0)}if(_e.needsLights&&(Bt.state.sunShadowMap.length>0&&st.setValue(L,"sunShadowMap",Bt.state.sunShadowMap,X),Bt.state.directionalShadowMap.length>0&&st.setValue(L,"directionalShadowMap",Bt.state.directionalShadowMap,X),Bt.state.spotShadowMap.length>0&&st.setValue(L,"spotShadowMap",Bt.state.spotShadowMap,X),Bt.state.pointShadowMap.length>0&&st.setValue(L,"pointShadowMap",Bt.state.pointShadowMap,X)),k.isSkinnedMesh){st.setOptional(L,k,"bindMatrix"),st.setOptional(L,k,"bindMatrixInverse");const ut=k.skeleton;ut&&(ut.boneTexture===null&&ut.computeBoneTexture(),st.setValue(L,"boneTexture",ut.boneTexture,X))}k.isBatchedMesh&&(st.setOptional(L,k,"batchingTexture"),st.setValue(L,"batchingTexture",k._matricesTexture,X),st.setOptional(L,k,"batchingIdTexture"),st.setValue(L,"batchingIdTexture",k._indirectTexture,X),st.setOptional(L,k,"batchingColorTexture"),k._colorsTexture!==null&&st.setValue(L,"batchingColorTexture",k._colorsTexture,X));const nn=W.morphAttributes;if((nn.position!==void 0||nn.normal!==void 0||nn.color!==void 0)&&D.update(k,W,si),(tn||_e.receiveShadow!==k.receiveShadow)&&(_e.receiveShadow=k.receiveShadow,st.setValue(L,"receiveShadow",k.receiveShadow)),(U.isMeshStandardMaterial||U.isMeshLambertMaterial||U.isMeshPhongMaterial)&&U.envMap===null&&I.environment!==null&&(vt.envMapIntensity.value=I.environmentIntensity),vt.dfgLUT!==void 0&&(vt.dfgLUT.value=W0()),tn){if(st.setValue(L,"toneMappingExposure",R.toneMappingExposure),_e.needsLights&&ld(vt,Ln),fe&&U.fog===!0&&Ee.refreshFogUniforms(vt,fe),Ee.refreshMaterialUniforms(vt,U,Q,Y,E.state.transmissionRenderTarget[v.id]),_e.needsLights&&_e.lightProbeGrid){const ut=_e.lightProbeGrid;vt.probesSH.value=ut.texture,vt.probesMin.value.copy(ut.boundingBox.min),vt.probesMax.value.copy(ut.boundingBox.max),vt.probesResolution.value.copy(ut.resolution)}Fr.upload(L,yl(_e),vt,X)}if(U.isShaderMaterial&&U.uniformsNeedUpdate===!0&&(Fr.upload(L,yl(_e),vt,X),U.uniformsNeedUpdate=!1),U.isSpriteMaterial&&st.setValue(L,"center",k.center),st.setValue(L,"modelViewMatrix",k.modelViewMatrix),st.setValue(L,"normalMatrix",k.normalMatrix),st.setValue(L,"modelMatrix",k.matrixWorld),U.uniformsGroups!==void 0){const ut=U.uniformsGroups;for(let sn=0,Nn=ut.length;sn<Nn;sn++){const Ml=ut[sn];te.update(Ml,si),te.bind(Ml,si)}}return si}function ld(v,I){v.ambientLightColor.needsUpdate=I,v.lightProbe.needsUpdate=I,v.sunLights.needsUpdate=I,v.sunLightShadows.needsUpdate=I,v.directionalLights.needsUpdate=I,v.directionalLightShadows.needsUpdate=I,v.pointLights.needsUpdate=I,v.pointLightShadows.needsUpdate=I,v.spotLights.needsUpdate=I,v.spotLightShadows.needsUpdate=I,v.rectAreaLights.needsUpdate=I,v.hemisphereLights.needsUpdate=I}function cd(v){return v.isMeshLambertMaterial||v.isMeshToonMaterial||v.isMeshPhongMaterial||v.isMeshStandardMaterial||v.isShadowMaterial||v.isShaderMaterial&&v.lights===!0}this.getActiveCubeFace=function(){return J},this.getActiveMipmapLevel=function(){return V},this.getRenderTarget=function(){return ne},this.setRenderTargetTextures=function(v,I,W){const U=G.get(v);U.__autoAllocateDepthBuffer=v.resolveDepthBuffer===!1,U.__autoAllocateDepthBuffer===!1&&(U.__useRenderToTexture=!1),G.get(v.texture).__webglTexture=I,G.get(v.depthTexture).__webglTexture=U.__autoAllocateDepthBuffer?void 0:W,U.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(v,I){const W=G.get(v);W.__webglFramebuffer=I,W.__useDefaultFramebuffer=I===void 0},this.setRenderTarget=function(v,I=0,W=0){ne=v,J=I,V=W;let U=null,k=!1,fe=!1;if(v){const de=G.get(v);if(de.__useDefaultFramebuffer!==void 0){x.bindFramebuffer(L.FRAMEBUFFER,de.__webglFramebuffer),ie.copy(v.viewport),Ae.copy(v.scissor),Te=v.scissorTest,x.viewport(ie),x.scissor(Ae),x.setScissorTest(Te),q=-1;return}else if(de.__webglFramebuffer===void 0)X.setupRenderTarget(v);else if(de.__hasExternalTextures)X.rebindTextures(v,G.get(v.texture).__webglTexture,G.get(v.depthTexture).__webglTexture);else if(v.depthBuffer){const Le=v.depthTexture;if(de.__boundDepthTexture!==Le){if(Le!==null&&G.has(Le)&&(v.width!==Le.image.width||v.height!==Le.image.height))throw new Error("THREE.WebGLRenderer: Attached DepthTexture is initialized to the incorrect size.");X.setupDepthRenderbuffer(v)}}const ye=v.texture;(ye.isData3DTexture||ye.isDataArrayTexture||ye.isCompressedArrayTexture)&&(fe=!0);const Me=G.get(v).__webglFramebuffer;v.isWebGLCubeRenderTarget?(Array.isArray(Me[I])?U=Me[I][W]:U=Me[I],k=!0):v.samples>0&&X.useMultisampledRTT(v)===!1?U=G.get(v).__webglMultisampledFramebuffer:Array.isArray(Me)?U=Me[W]:U=Me,ie.copy(v.viewport),Ae.copy(v.scissor),Te=v.scissorTest}else ie.copy(me).multiplyScalar(Q).floor(),Ae.copy(Fe).multiplyScalar(Q).floor(),Te=Tt;if(W!==0&&(U=B),x.bindFramebuffer(L.FRAMEBUFFER,U)&&x.drawBuffers(v,U),x.viewport(ie),x.scissor(Ae),x.setScissorTest(Te),k){const de=G.get(v.texture);L.framebufferTexture2D(L.FRAMEBUFFER,L.COLOR_ATTACHMENT0,L.TEXTURE_CUBE_MAP_POSITIVE_X+I,de.__webglTexture,W)}else if(fe){const de=I;for(let ye=0;ye<v.textures.length;ye++){const Me=G.get(v.textures[ye]);L.framebufferTextureLayer(L.FRAMEBUFFER,L.COLOR_ATTACHMENT0+ye,Me.__webglTexture,W,de)}}else if(v!==null&&W!==0){const de=G.get(v.texture);L.framebufferTexture2D(L.FRAMEBUFFER,L.COLOR_ATTACHMENT0,L.TEXTURE_2D,de.__webglTexture,W)}q=-1};function Sl(v){const I=G.get(v);return(I.__readFormat!==v.format||I.__readType!==v.type)&&(I.__readFormat=v.format,I.__readType=v.type,I.__formatReadable=b.textureFormatReadable(v.format),I.__typeReadable=b.textureTypeReadable(v.type)),I}this.readRenderTargetPixels=function(v,I,W,U,k,fe,ge,de=0){if(!(v&&v.isWebGLRenderTarget)){Ke("WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let ye=G.get(v).__webglFramebuffer;if(v.isWebGLCubeRenderTarget&&ge!==void 0&&(ye=ye[ge]),ye){x.bindFramebuffer(L.FRAMEBUFFER,ye);try{const Me=v.textures[de],Le=Me.format,Ue=Me.type;v.textures.length>1&&L.readBuffer(L.COLOR_ATTACHMENT0+de);const ve=Sl(Me);if(ve.__formatReadable===!1){Ke("WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(ve.__typeReadable===!1){Ke("WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}I>=0&&I<=v.width-U&&W>=0&&W<=v.height-k&&L.readPixels(I,W,U,k,ce.convert(Le),ce.convert(Ue),fe)}finally{const Me=ne!==null?G.get(ne).__webglFramebuffer:null;x.bindFramebuffer(L.FRAMEBUFFER,Me)}}},this.readRenderTargetPixelsAsync=async function(v,I,W,U,k,fe,ge,de=0){if(!(v&&v.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let ye=G.get(v).__webglFramebuffer;if(v.isWebGLCubeRenderTarget&&ge!==void 0&&(ye=ye[ge]),ye)if(I>=0&&I<=v.width-U&&W>=0&&W<=v.height-k){x.bindFramebuffer(L.FRAMEBUFFER,ye);const Me=v.textures[de],Le=Me.format,Ue=Me.type;v.textures.length>1&&L.readBuffer(L.COLOR_ATTACHMENT0+de);const ve=Sl(Me);if(ve.__formatReadable===!1)throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(ve.__typeReadable===!1)throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");const Ze=L.createBuffer();L.bindBuffer(L.PIXEL_PACK_BUFFER,Ze),L.bufferData(L.PIXEL_PACK_BUFFER,fe.byteLength,L.STREAM_READ),L.readPixels(I,W,U,k,ce.convert(Le),ce.convert(Ue),0),L.bindBuffer(L.PIXEL_PACK_BUFFER,null);const Mt=ne!==null?G.get(ne).__webglFramebuffer:null;x.bindFramebuffer(L.FRAMEBUFFER,Mt);const dt=L.fenceSync(L.SYNC_GPU_COMMANDS_COMPLETE,0);return L.flush(),await hf(L,dt,4),L.bindBuffer(L.PIXEL_PACK_BUFFER,Ze),L.getBufferSubData(L.PIXEL_PACK_BUFFER,0,fe),L.bindBuffer(L.PIXEL_PACK_BUFFER,null),L.deleteBuffer(Ze),L.deleteSync(dt),fe}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")},this.copyFramebufferToTexture=function(v,I=null,W=0){const U=Math.pow(2,-W),k=Math.floor(v.image.width*U),fe=Math.floor(v.image.height*U),ge=I!==null?I.x:0,de=I!==null?I.y:0;X.setTexture2D(v,0),L.copyTexSubImage2D(L.TEXTURE_2D,W,0,0,ge,de,k,fe),x.unbindTexture()},this.copyTextureToTexture=function(v,I,W=null,U=null,k=0,fe=0){let ge,de,ye,Me,Le,Ue,ve,Ze,Mt;const dt=v.isCompressedTexture?v.mipmaps[fe]:v.image;if(W!==null)ge=W.max.x-W.min.x,de=W.max.y-W.min.y,ye=W.isBox3?W.max.z-W.min.z:1,Me=W.min.x,Le=W.min.y,Ue=W.isBox3?W.min.z:0;else{const vt=Math.pow(2,-k);ge=Math.floor(dt.width*vt),de=Math.floor(dt.height*vt),v.isDataArrayTexture?ye=dt.depth:v.isData3DTexture?ye=Math.floor(dt.depth*vt):ye=1,Me=0,Le=0,Ue=0}U!==null?(ve=U.x,Ze=U.y,Mt=U.z):(ve=0,Ze=0,Mt=0);const at=ce.convert(I.format),Ft=ce.convert(I.type);let _e;I.isData3DTexture?(X.setTexture3D(I,0),_e=L.TEXTURE_3D):I.isDataArrayTexture||I.isCompressedArrayTexture?(X.setTexture2DArray(I,0),_e=L.TEXTURE_2D_ARRAY):(X.setTexture2D(I,0),_e=L.TEXTURE_2D),x.activeTexture(L.TEXTURE0),x.pixelStorei(L.UNPACK_FLIP_Y_WEBGL,I.flipY),x.pixelStorei(L.UNPACK_PREMULTIPLY_ALPHA_WEBGL,I.premultiplyAlpha),x.pixelStorei(L.UNPACK_ALIGNMENT,I.unpackAlignment);const Bt=x.getParameter(L.UNPACK_ROW_LENGTH),Ye=x.getParameter(L.UNPACK_IMAGE_HEIGHT),si=x.getParameter(L.UNPACK_SKIP_PIXELS),Ei=x.getParameter(L.UNPACK_SKIP_ROWS),tn=x.getParameter(L.UNPACK_SKIP_IMAGES);x.pixelStorei(L.UNPACK_ROW_LENGTH,dt.width),x.pixelStorei(L.UNPACK_IMAGE_HEIGHT,dt.height),x.pixelStorei(L.UNPACK_SKIP_PIXELS,Me),x.pixelStorei(L.UNPACK_SKIP_ROWS,Le),x.pixelStorei(L.UNPACK_SKIP_IMAGES,Ue);const Ln=v.isDataArrayTexture||v.isData3DTexture,st=I.isDataArrayTexture||I.isData3DTexture;if(v.isDepthTexture){const vt=G.get(v),nn=G.get(I),ut=G.get(vt.__renderTarget),sn=G.get(nn.__renderTarget);x.bindFramebuffer(L.READ_FRAMEBUFFER,ut.__webglFramebuffer),x.bindFramebuffer(L.DRAW_FRAMEBUFFER,sn.__webglFramebuffer);for(let Nn=0;Nn<ye;Nn++)Ln&&(L.framebufferTextureLayer(L.READ_FRAMEBUFFER,L.COLOR_ATTACHMENT0,G.get(v).__webglTexture,k,Ue+Nn),L.framebufferTextureLayer(L.DRAW_FRAMEBUFFER,L.COLOR_ATTACHMENT0,G.get(I).__webglTexture,fe,Mt+Nn)),L.blitFramebuffer(Me,Le,ge,de,ve,Ze,ge,de,L.DEPTH_BUFFER_BIT,L.NEAREST);x.bindFramebuffer(L.READ_FRAMEBUFFER,null),x.bindFramebuffer(L.DRAW_FRAMEBUFFER,null)}else if(k!==0||v.isRenderTargetTexture||G.has(v)){const vt=G.get(v),nn=G.get(I);x.bindFramebuffer(L.READ_FRAMEBUFFER,N),x.bindFramebuffer(L.DRAW_FRAMEBUFFER,H);for(let ut=0;ut<ye;ut++)Ln?L.framebufferTextureLayer(L.READ_FRAMEBUFFER,L.COLOR_ATTACHMENT0,vt.__webglTexture,k,Ue+ut):L.framebufferTexture2D(L.READ_FRAMEBUFFER,L.COLOR_ATTACHMENT0,L.TEXTURE_2D,vt.__webglTexture,k),st?L.framebufferTextureLayer(L.DRAW_FRAMEBUFFER,L.COLOR_ATTACHMENT0,nn.__webglTexture,fe,Mt+ut):L.framebufferTexture2D(L.DRAW_FRAMEBUFFER,L.COLOR_ATTACHMENT0,L.TEXTURE_2D,nn.__webglTexture,fe),k!==0?L.blitFramebuffer(Me,Le,ge,de,ve,Ze,ge,de,L.COLOR_BUFFER_BIT,L.NEAREST):st?L.copyTexSubImage3D(_e,fe,ve,Ze,Mt+ut,Me,Le,ge,de):L.copyTexSubImage2D(_e,fe,ve,Ze,Me,Le,ge,de);x.bindFramebuffer(L.READ_FRAMEBUFFER,null),x.bindFramebuffer(L.DRAW_FRAMEBUFFER,null)}else st?v.isDataTexture||v.isData3DTexture?L.texSubImage3D(_e,fe,ve,Ze,Mt,ge,de,ye,at,Ft,dt.data):I.isCompressedArrayTexture?L.compressedTexSubImage3D(_e,fe,ve,Ze,Mt,ge,de,ye,at,dt.data):L.texSubImage3D(_e,fe,ve,Ze,Mt,ge,de,ye,at,Ft,dt):v.isDataTexture?L.texSubImage2D(L.TEXTURE_2D,fe,ve,Ze,ge,de,at,Ft,dt.data):v.isCompressedTexture?L.compressedTexSubImage2D(L.TEXTURE_2D,fe,ve,Ze,dt.width,dt.height,at,dt.data):L.texSubImage2D(L.TEXTURE_2D,fe,ve,Ze,ge,de,at,Ft,dt);x.pixelStorei(L.UNPACK_ROW_LENGTH,Bt),x.pixelStorei(L.UNPACK_IMAGE_HEIGHT,Ye),x.pixelStorei(L.UNPACK_SKIP_PIXELS,si),x.pixelStorei(L.UNPACK_SKIP_ROWS,Ei),x.pixelStorei(L.UNPACK_SKIP_IMAGES,tn),fe===0&&I.generateMipmaps&&L.generateMipmap(_e),x.unbindTexture()},this.initRenderTarget=function(v){G.get(v).__webglFramebuffer===void 0&&X.setupRenderTarget(v)},this.initTexture=function(v){v.isCubeTexture?X.setTextureCube(v,0):v.isData3DTexture?X.setTexture3D(v,0):v.isDataArrayTexture||v.isCompressedArrayTexture?X.setTexture2DArray(v,0):X.setTexture2D(v,0),x.unbindTexture()},this.resetState=function(){J=0,V=0,ne=null,x.reset(),pe.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return Li}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e;const t=this.getContext();t.drawingBufferColorSpace=We._getDrawingBufferColorSpace(e),t.unpackColorSpace=We._getUnpackColorSpace()}}const hn=64,Ic=48,X0=.12,Dc=16,q0=64,Y0="'Yucca Mono', 'Fira Code', 'Courier New', Courier, monospace",Ha=new Set([0,32]);class Vr{constructor(e={}){if(e===null||typeof e!="object")throw new TypeError("[FontAtlas] options must be an object.");this._fontFamily=typeof e.fontFamily=="string"&&e.fontFamily?e.fontFamily:Y0,this._weight=Number.isFinite(e.weight)&&e.weight>0?e.weight:700,this._tiles=Dc,this._slots=new Map,this._nextSlot=1,this._generation=1,this._rasterCount=0;const t=typeof e.createCanvas=="function"?e.createCanvas:typeof document<"u"&&typeof document.createElement=="function"?(i,n)=>{const s=document.createElement("canvas");return s.width=i,s.height=n,s}:null;this._createCanvas=t,this._canvas=null,this._ctx=null,t&&this._allocateSurface()}get atlasGeneration(){return this._generation}get tilesX(){return this._tiles}get tileSize(){return hn}get atlasSize(){return this._tiles*hn}get capacity(){return this._tiles*this._tiles}get glyphCount(){return this._slots.size}get rasterizedCount(){return this._rasterCount}get canRasterize(){return this._ctx!==null}get canvas(){return this._canvas}slotFor(e){return Ha.has(e)?0:this._slots.get(e)??0}has(e){return Ha.has(e)||this._slots.has(e)}ensure(e){if(!e||typeof e[Symbol.iterator]!="function")throw new TypeError("[FontAtlas] ensure() requires an iterable of code points.");const t=[];for(const n of e){const s=n>>>0;Ha.has(s)||this._slots.has(s)||t.push(s)}if(t.length===0)return!1;t.sort((n,s)=>n-s);let i=!1;for(;this._nextSlot+t.length>this.capacity;){if(this._tiles>=q0){const n=this.capacity-this._nextSlot;if(n<=0)return!1;t.length=n;break}this._tiles*=2,i=!0}if(i){this._allocateSurface();for(const n of this._slots.keys())this._rasterize(n,this._slots.get(n))}for(const n of t){const s=this._nextSlot;this._nextSlot+=1,this._slots.set(n,s),this._rasterize(n,s)}return this._generation+=1,!0}static layoutSlot(e,t){const i=t>0?t:Dc,n=Math.max(0,Math.trunc(e));return{col:n%i,row:Math.floor(n/i)}}uvRect(e){const{col:t,row:i}=Vr.layoutSlot(e,this._tiles),n=1/this._tiles,s=.5/this.atlasSize;return{u0:t*n+s,v0:i*n+s,u1:(t+1)*n-s,v1:(i+1)*n-s}}getMetrics(){return{tiles:this._tiles,atlasSize:this.atlasSize,capacity:this.capacity,glyphs:this._slots.size,rasterized:this._rasterCount,generation:this._generation,headless:this._ctx===null}}_allocateSurface(){if(!this._createCanvas)return;const e=this.atlasSize;this._canvas=this._createCanvas(e,e),this._ctx=this._canvas?this._canvas.getContext("2d"):null,this._ctx&&this._ctx.clearRect(0,0,e,e)}_rasterize(e,t){if(!this._ctx)return;const{col:i,row:n}=Vr.layoutSlot(t,this._tiles),s=i*hn,a=n*hn,o=this._ctx;o.clearRect(s,a,hn,hn),o.font=`${this._weight} ${Ic}px ${this._fontFamily}`,o.textAlign="center",o.textBaseline="middle",o.fillStyle="#ffffff",o.fillText(String.fromCodePoint(e),s+hn/2,a+hn/2+Ic*X0),this._rasterCount+=1}}const Xr=4;function $0(r,e,t,i=null){if(!r||!r.charCodes)throw new TypeError("[GLDataPack] buffer must expose charCodes.");if(typeof e.slotFor!="function")throw new TypeError("[GLDataPack] atlas must expose slotFor().");if(!(t instanceof Uint8Array)||t.length<r.cellCount*Xr)throw new RangeError("[GLDataPack] out must be Uint8Array of cellCount × 4.");const n=r.charCodes,s=r.cellCount,a=e.slotFor.bind(e);let o=0,l=0;for(let c=0,h=0;c<s;c+=1,h+=Xr){const d=n[c],u=a(d);t[h]=u&255,t[h+1]=u>>>8&255;const f=i!==null&&u!==0&&i.has(d);t[h+2]=f?255:0,t[h+3]=255,f&&(o+=1),u===0&&(l+=1)}return{packed:s,waterCells:o,blankCells:l}}function Lc(r,e){if(!(r instanceof Uint32Array))throw new TypeError("[GLDataPack] src must be a Uint32Array color plane.");if(!(e instanceof Uint8Array)||e.length<r.length*Xr)throw new RangeError("[GLDataPack] out must be Uint8Array of cellCount × 4.");const t=r.length;for(let i=0,n=0;i<t;i+=1,n+=Xr){const s=r[i];e[n]=s>>>24&255,e[n+1]=s>>>16&255,e[n+2]=s>>>8&255,e[n+3]=s&255}return t}function K0(r,e){if(!r||!r.charCodes)throw new TypeError("[GLDataPack] buffer must expose charCodes.");if(!(e instanceof Set))throw new TypeError("[GLDataPack] out must be a Set.");e.clear();const t=r.charCodes;for(let i=0;i<t.length;i+=1){const n=t[i];n!==0&&n!==32&&e.add(n)}return e.size}const Ps=8,Ga=[.043,.055,.078],j0=`
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,J0=`
varying vec2 vUv;

uniform sampler2D uAtlas;   /* glyph coverage atlas (white on transparent)  */
uniform sampler2D uChars;   /* r/g = atlas slot, b = water flag             */
uniform sampler2D uFg;      /* per-cell foreground rgb                      */
uniform sampler2D uBg;      /* per-cell background rgba                     */

uniform vec2  uGrid;        /* buffer size in cells                         */
uniform vec2  uCam;         /* camera top-left in world CSS px (incl. shake)*/
uniform vec2  uCell;        /* base cell size in CSS px                     */
uniform vec2  uViewport;    /* viewport size in CSS px                      */
uniform float uZoom;        /* camera zoom (>= 1 close-up)                  */
uniform float uTime;        /* presentation clock, seconds                  */

uniform float uFlash;       /* lightning inversion 0..1                     */
uniform float uRain;        /* rain intensity 0..1                          */
uniform float uGloom;       /* storm gloom 0..1                             */
uniform float uGlitch;      /* orange depletion 0..1                        */
uniform float uGrayscale;   /* Drab World luminance collapse 0/1            */
uniform vec3  uTint;        /* dimension ambient tint                       */
uniform float uTintStrength;

uniform float uWaterFrequency;
uniform float uWaterAmplitude;
uniform float uWaterSpeed;

uniform vec4  uLights[${Ps}];    /* x, y, radius (world px), intensity */
uniform vec3  uLightColors[${Ps}];
uniform int   uLightCount;

uniform vec2  uAtlasTiles;  /* atlas tiles per axis                        */

/* -- deterministic hash (spores, streaks, glitch bands) ------------------- */
float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

/* -- raw char texel; outside the grid reads pure blank --------------------- */
vec4 cellRaw(vec2 cell) {
    if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= uGrid.x || cell.y >= uGrid.y) {
        return vec4(0.0);
    }
    return texture2D(uChars, (cell + 0.5) / uGrid);
}

/* -- composite one cell: atlas coverage over bg tinted by fg --------------- */
vec3 cellColor(vec2 cell, vec2 sub, out float waterFlag) {
    vec4 cd = cellRaw(cell);
    float slot = cd.r * 255.0 + cd.g * 255.0 * 256.0;
    waterFlag = step(128.0, cd.b);

    vec2 gridUv = (cell + 0.5) / uGrid;
    vec3 fg = texture2D(uFg, gridUv).rgb;
    vec4 bgT = texture2D(uBg, gridUv);
    vec3 bg = bgT.a < 0.02 ? vec3(0.043, 0.055, 0.078) : bgT.rgb;

    vec3 col = bg;
    if (slot > 0.5) {
        vec2 tile = vec2(mod(slot, uAtlasTiles.x), floor(slot / uAtlasTiles.x));
        vec2 inner = clamp(sub, 0.04, 0.96);
        vec2 atlasUv = (tile + inner) / uAtlasTiles;
        float coverage = texture2D(uAtlas, atlasUv).a;
        col = mix(bg, fg, coverage);
    }
    return col;
}

void main() {
    /* vUv (0,0) is bottom-left in GL; the grid is authored top-left. */
    vec2 screenPx = vec2(vUv.x, 1.0 - vUv.y) * uViewport;

    /* ---- glitch band tear (orange depletion) --------------------------- */
    float glitchShift = 0.0;
    if (uGlitch > 0.001) {
        float bandH = max(24.0, uViewport.y / 22.0);
        float band = floor(screenPx.y / bandH);
        float jitter = hash12(vec2(band, floor(uTime * 16.0)));
        float active = step(0.35, jitter);
        glitchShift = (jitter - 0.5) * 46.0 * uGlitch * active;
    }

    /* ---- camera: world position of this fragment ------------------------ */
    vec2 worldPx = uCam + (screenPx + vec2(glitchShift, 0.0)) / uZoom;
    vec2 cellF = worldPx / uCell;
    vec2 cell = floor(cellF);
    vec2 sub = fract(cellF);

    float waterFlag;
    vec3 col = cellColor(cell, sub, waterFlag);

    /* ---- water ripple resample ------------------------------------------
     * y' = y + sin(x·f + t·speed)·a  (blueprint formula) plus a slower
     * counter-diagonal harmonic; blended with a horizontal shimmer.      */
    if (waterFlag > 0.5) {
        vec2 ripple;
        ripple.x = cellF.x + sin(cellF.y * uWaterFrequency * 0.62
                                 + uTime * uWaterSpeed * 1.31)
                   * uWaterAmplitude * 0.5;
        ripple.y = cellF.y + sin(cellF.x * uWaterFrequency
                                 + uTime * uWaterSpeed)
                   * uWaterAmplitude;
        float ignored;
        vec3 reflected = cellColor(floor(ripple), fract(ripple), ignored);
        float shimmer = 0.5 + 0.5 * sin(cellF.x * uWaterFrequency * 2.3
                                        + uTime * uWaterSpeed * 1.7);
        col = mix(col, reflected * (0.78 + 0.22 * shimmer), 0.62);
    }

    /* ---- radial lights (world-pixel space, squared falloff) ------------- */
    if (uLightCount > 0) {
        vec3 light = vec3(0.0);
        for (int i = 0; i < ${Ps}; i++) {
            if (i >= uLightCount) break;
            vec4 L = uLights[i];
            float d = distance(worldPx, L.xy);
            float fall = clamp(1.0 - d / max(L.z, 0.001), 0.0, 1.0);
            light += uLightColors[i] * (L.w * fall * fall);
        }
        col += light * 0.55;
    }

    /* ---- rain sheen: two parallax streak layers -------------------------- */
    if (uRain > 0.001) {
        float sheen = 0.0;

        float w0 = 14.0;
        float c0 = floor(screenPx.x / w0);
        float on0 = step(0.55, hash12(vec2(c0, 0.0)));
        float len0 = 120.0;
        float y0 = mod(hash12(vec2(c0, 1.0)) * uViewport.y + uTime * 900.0,
                       uViewport.y + len0) - len0;
        float d0 = screenPx.y - y0;
        sheen += on0 * smoothstep(len0, len0 * 0.25, d0) * smoothstep(-2.0, 6.0, d0);

        float w1 = 31.0;
        float c1 = floor(screenPx.x / w1 + 7.0);
        float on1 = step(0.35, hash12(vec2(c1, 2.0)));
        float len1 = 210.0;
        float y1 = mod(hash12(vec2(c1, 3.0)) * uViewport.y + uTime * 1500.0,
                       uViewport.y + len1) - len1;
        float d1 = screenPx.y - y1;
        sheen += on1 * 0.7 * smoothstep(len1, len1 * 0.25, d1) * smoothstep(-2.0, 8.0, d1);

        col += vec3(0.42, 0.52, 0.66) * sheen * uRain * 0.20;
    }

    /* ---- storm gloom ----------------------------------------------------- */
    col *= 1.0 - uGloom * 0.35;

    /* ---- dimension ambient tint ------------------------------------------ */
    col = mix(col, col * uTint, uTintStrength);

    /* ---- Drab World grayscale (Rec.709, mirrors Renderer.setGrayscale) --- */
    float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(col, vec3(luma), uGrayscale);

    /* ---- X-ray lightning inversion --------------------------------------- */
    if (uFlash > 0.001) {
        vec3 inverted = 1.0 - col;
        float invLuma = dot(inverted, vec3(0.3333));
        inverted = mix(vec3(invLuma), inverted, 0.65);
        col = mix(col, inverted, clamp(uFlash, 0.0, 1.0));
    }

    /* ---- glitch chroma tear ----------------------------------------------- */
    if (uGlitch > 0.001) {
        float phase = sin(uTime * 42.0 + vUv.y * 34.0);
        col.r *= 1.0 + 0.35 * uGlitch * phase;
        col.b *= 1.0 - 0.25 * uGlitch * phase;
    }

    /* ---- vignette ---------------------------------------------------------- */
    float vig = smoothstep(1.32, 0.42, length(vUv - 0.5) * 1.414);
    col *= mix(0.80, 1.0, vig);

    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;class Z0{constructor(e,t={}){if(t===null||typeof t!="object")throw new TypeError("[Engine] options must be an object.");this._canvas=e,this._cellW=Number.isFinite(t.cellWidth)&&t.cellWidth>0?t.cellWidth:9.6,this._cellH=Number.isFinite(t.cellHeight)&&t.cellHeight>0?t.cellHeight:20,this._cssW=1280,this._cssH=800,this._dpr=1;const i=this._probeGL(e);if(this._supported=i!==null,this._backend=i!==null?String(i.getParameter(i.VERSION)||"WebGL"):"none",this._metrics={frames:0,lastPackMs:0,lastWaterCells:0,lastBlankCells:0,atlasUploads:0,supported:this._supported,backend:this._backend},!this._supported){this._waterCodes=new Set;return}this._atlas=new Vr({fontFamily:t.fontFamily,weight:700}),this._vocab=new Set,this._atlasGeneration=-1,this._three=new V0({canvas:e,antialias:!1,alpha:!1,powerPreference:"high-performance",stencil:!1,depth:!1}),this._three.setClearColor(new Xe(Ga[0],Ga[1],Ga[2]),1),this._scene=new bf,this._camera=new al(-1,1,1,-1,0,1),this._charBytes=null,this._fgBytes=null,this._bgBytes=null,this._charTex=null,this._fgTex=null,this._bgTex=null,this._atlasTex=null,this._gridW=0,this._gridH=0,this._waterCodes=new Set;const n=[],s=[];for(let l=0;l<Ps;l+=1)n.push(new xt(0,0,1,0)),s.push(new Xe(0,0,0));this._uniforms={uAtlas:{value:null},uChars:{value:null},uFg:{value:null},uBg:{value:null},uGrid:{value:new Ge(1,1)},uCam:{value:new Ge(0,0)},uCell:{value:new Ge(this._cellW,this._cellH)},uViewport:{value:new Ge(this._cssW,this._cssH)},uZoom:{value:1},uTime:{value:0},uFlash:{value:0},uRain:{value:0},uGloom:{value:0},uGlitch:{value:0},uGrayscale:{value:0},uTint:{value:new Xe(1,1,1)},uTintStrength:{value:0},uWaterFrequency:{value:.55},uWaterAmplitude:{value:1.4},uWaterSpeed:{value:2.2},uLights:{value:n},uLightColors:{value:s},uLightCount:{value:0},uAtlasTiles:{value:new Ge(16,16)}},this._colorCache=new Map;const a=new Bs(2,2),o=new Si({vertexShader:j0,fragmentShader:J0,uniforms:this._uniforms,depthTest:!1,depthWrite:!1});this._quad=new Ui(a,o),this._quad.frustumCulled=!1,this._scene.add(this._quad),this._clock=performance.now()*.001}get isSupported(){return this._supported}get backend(){return this._backend}_probeGL(e){if(!e||typeof e.getContext!="function")return null;try{return e.getContext("webgl2")||e.getContext("webgl")}catch{return null}}destroy(){var e,t,i,n,s;if(!(!this._supported&&!this._three)){this._supported=!1;try{(e=this._charTex)==null||e.dispose(),(t=this._fgTex)==null||t.dispose(),(i=this._bgTex)==null||i.dispose(),(n=this._atlasTex)==null||n.dispose(),this._quad&&(this._quad.geometry.dispose(),this._quad.material.dispose()),(s=this._three)==null||s.dispose()}catch(a){console.warn("[Engine] destroy() encountered an error:",a)}this._charTex=null,this._fgTex=null,this._bgTex=null,this._atlasTex=null,this._three=null}}setCellMetrics(e,t){return!Number.isFinite(e)||e<=0?this:!Number.isFinite(t)||t<=0?this:(this._cellW=e,this._cellH=t,this._uniforms&&this._uniforms.uCell.value.set(e,t),this)}handleResize(e){return!this._supported||!e?this:(this._cssW=Math.max(1,Math.floor(e.cssWidth||this._cssW)),this._cssH=Math.max(1,Math.floor(e.cssHeight||this._cssH)),this._dpr=Number.isFinite(e.dpr)&&e.dpr>0?e.dpr:1,this._three.setPixelRatio(this._dpr),this._three.setSize(this._cssW,this._cssH,!1),this._uniforms.uViewport.value.set(this._cssW,this._cssH),this)}setWaterGlyphs(e){if(this._waterCodes.clear(),!e)return this;for(const t of e)this._waterCodes.add(typeof t=="string"?t.codePointAt(0):t>>>0);return this}setFrameState(e){if(!this._supported||!e)return this;const t=this._uniforms;if(Number.isFinite(e.flash)&&(t.uFlash.value=_s(e.flash)),Number.isFinite(e.rain)&&(t.uRain.value=_s(e.rain)),Number.isFinite(e.gloom)&&(t.uGloom.value=_s(e.gloom)),Number.isFinite(e.glitch)&&(t.uGlitch.value=_s(e.glitch)),Number.isFinite(e.grayscale)&&(t.uGrayscale.value=e.grayscale>.5?1:0),e.tint!==void 0&&t.uTint.value.copy(this._toColor(e.tint,t.uTint.value)),Number.isFinite(e.tintStrength)&&(t.uTintStrength.value=_s(e.tintStrength)),e.water&&typeof e.water=="object"){const i=e.water;Number.isFinite(i.frequency)&&i.frequency>0&&(t.uWaterFrequency.value=i.frequency),Number.isFinite(i.amplitude)&&i.amplitude>=0&&(t.uWaterAmplitude.value=i.amplitude),Number.isFinite(i.speed)&&i.speed>=0&&(t.uWaterSpeed.value=i.speed)}if(Array.isArray(e.lights)){const i=t.uLights.value,n=t.uLightColors.value,s=Math.min(e.lights.length,Ps);for(let a=0;a<s;a+=1){const o=e.lights[a];o&&(i[a].set(Number.isFinite(o.x)?o.x:0,Number.isFinite(o.y)?o.y:0,Number.isFinite(o.radius)&&o.radius>0?o.radius:96,Number.isFinite(o.intensity)?o.intensity:.5),n[a].copy(this._toColor(o.color??"#ffb46b",n[a])))}t.uLightCount.value=s}return this}_toColor(e,t){if(typeof e=="string"){let i=this._colorCache.get(e);return i||(i=new Xe(e),this._colorCache.size>256&&this._colorCache.clear(),this._colorCache.set(e,i)),i}return Array.isArray(e)&&e.length>=3?new Xe(e[0],e[1],e[2]):t}present(e,t={}){if(!this._supported)return!1;const i=performance.now();K0(e,this._vocab),this._atlas.ensure(this._vocab)&&(this._atlasGeneration=-1),this._atlasGeneration!==this._atlas.atlasGeneration&&(this._uploadAtlasTexture(),this._atlasGeneration=this._atlas.atlasGeneration,this._metrics.atlasUploads+=1),this._ensureDataTextures(e.cols,e.rows);const n=$0(e,this._atlas,this._charBytes,this._waterCodes);Lc(e.foregroundColors,this._fgBytes),Lc(e.backgroundColors,this._bgBytes),this._charTex.needsUpdate=!0,this._fgTex.needsUpdate=!0,this._bgTex.needsUpdate=!0;const s=this._uniforms,a=Math.max(.05,t.zoom??1),o=t.shakeX||0,l=t.shakeY||0;return s.uCam.value.set((t.x||0)+o/a,(t.y||0)+l/a),s.uZoom.value=a,s.uTime.value=performance.now()*.001-this._clock,s.uGrid.value.set(e.cols,e.rows),this._three.render(this._scene,this._camera),this._metrics.frames+=1,this._metrics.lastPackMs=performance.now()-i,this._metrics.lastWaterCells=n.waterCells,this._metrics.lastBlankCells=n.blankCells,!0}_uploadAtlasTexture(){this._atlas.canRasterize&&(this._atlasTex?(this._atlasTex.image=this._atlas.canvas,this._atlasTex.needsUpdate=!0):(this._atlasTex=new Of(this._atlas.canvas),this._atlasTex.flipY=!1,this._atlasTex.generateMipmaps=!1,this._atlasTex.minFilter=Dt,this._atlasTex.magFilter=Dt,this._atlasTex.wrapS=ii,this._atlasTex.wrapT=ii,this._uniforms.uAtlas.value=this._atlasTex),this._uniforms.uAtlasTiles.value.set(this._atlas.tilesX,this._atlas.tilesX))}_ensureDataTextures(e,t){var s,a,o;if(this._charTex&&e===this._gridW&&t===this._gridH)return;const n=e*t*4;this._charBytes=new Uint8Array(n),this._fgBytes=new Uint8Array(n),this._bgBytes=new Uint8Array(n),(s=this._charTex)==null||s.dispose(),(a=this._fgTex)==null||a.dispose(),(o=this._bgTex)==null||o.dispose(),this._charTex=this._makeDataTexture(this._charBytes,e,t),this._fgTex=this._makeDataTexture(this._fgBytes,e,t),this._bgTex=this._makeDataTexture(this._bgBytes,e,t),this._uniforms.uChars.value=this._charTex,this._uniforms.uFg.value=this._fgTex,this._uniforms.uBg.value=this._bgTex,this._gridW=e,this._gridH=t}_makeDataTexture(e,t,i){const n=new Uu(e,t,i);return n.format=ci,n.type=ti,n.minFilter=bt,n.magFilter=bt,n.wrapS=ii,n.wrapT=ii,n.generateMipmaps=!1,n.needsUpdate=!0,n}getMetrics(){return{...this._metrics,grid:this._gridW>0?`${this._gridW}x${this._gridH}`:null,atlas:this._atlas?this._atlas.getMetrics():null,lights:this._uniforms?this._uniforms.uLightCount.value:0,zoom:this._uniforms?this._uniforms.uZoom.value:1}}}function _s(r){return r<0?0:r>1?1:r}const bs=Object.freeze({LEFT:0,MIDDLE:1,RIGHT:2,BACK:3,FORWARD:4}),Nc=5,Q0=Object.freeze({MOVE_UP:["KeyW","ArrowUp"],MOVE_DOWN:["KeyS","ArrowDown"],MOVE_LEFT:["KeyA","ArrowLeft"],MOVE_RIGHT:["KeyD","ArrowRight"],SPRINT:["ShiftLeft","ShiftRight"],ACTION:["Space","Enter"],DODGE:["Space"],INTERACT:["KeyE"],INVENTORY:["KeyI"],QUEST_LOG:["KeyQ"],WORLD_MAP:["KeyM"],DIMENSION_FOCUS:["Tab"],ZOOM_IN:["Equal","NumpadAdd"],ZOOM_OUT:["Minus","NumpadSubtract"],ZOOM_RESET:["Digit0","Numpad0"],PAUSE:["Escape"]});class ex{constructor(e=window,t=null,i={}){if(t!==null&&!(t instanceof HTMLCanvasElement))throw new TypeError("[InputManager] canvas must be an HTMLCanvasElement or null.");this._target=e,this._canvas=t,this._enabled=!0,this._keysDown=new Set,this._keysPressedPending=new Set,this._keysReleasedPending=new Set,this._keysJustPressed=new Set,this._keysJustReleased=new Set,this._buttonsDown=new Array(Nc).fill(!1),this._buttonsPressedPending=new Set,this._buttonsReleasedPending=new Set,this._buttonsJustPressed=new Set,this._buttonsJustReleased=new Set,this._mouseX=0,this._mouseY=0,this._mouseDeltaX=0,this._mouseDeltaY=0,this._lastDeltaX=0,this._lastDeltaY=0,this._wheelDeltaY=0,this._wheelDeltaX=0,this._actionMap=new Map,this._codeToActions=new Map,this._preventDefaultCodes=new Set,this.setActionMap(i.actionMap??Q0),this._onKeyDown=n=>this._handleKeyDown(n),this._onKeyUp=n=>this._handleKeyUp(n),this._onMouseMove=n=>this._handleMouseMove(n),this._onMouseDown=n=>this._handleMouseDown(n),this._onMouseUp=n=>this._handleMouseUp(n),this._onWheel=n=>this._handleWheel(n),this._onBlur=()=>this.releaseAll(),this._onContextMenu=n=>{this._enabled&&n.preventDefault()},this._attach()}_attach(){this._target.addEventListener("keydown",this._onKeyDown),this._target.addEventListener("keyup",this._onKeyUp),this._target.addEventListener("blur",this._onBlur),this._target.addEventListener("mousemove",this._onMouseMove,{passive:!0}),this._target.addEventListener("mouseup",this._onMouseUp),this._canvas?(this._canvas.addEventListener("mousedown",this._onMouseDown),this._canvas.addEventListener("contextmenu",this._onContextMenu),this._canvas.addEventListener("wheel",this._onWheel,{passive:!1})):(this._target.addEventListener("mousedown",this._onMouseDown),this._target.addEventListener("wheel",this._onWheel,{passive:!1}))}destroy(){this._target.removeEventListener("keydown",this._onKeyDown),this._target.removeEventListener("keyup",this._onKeyUp),this._target.removeEventListener("blur",this._onBlur),this._target.removeEventListener("mousemove",this._onMouseMove),this._target.removeEventListener("mouseup",this._onMouseUp),this._canvas?(this._canvas.removeEventListener("mousedown",this._onMouseDown),this._canvas.removeEventListener("contextmenu",this._onContextMenu),this._canvas.removeEventListener("wheel",this._onWheel)):(this._target.removeEventListener("mousedown",this._onMouseDown),this._target.removeEventListener("wheel",this._onWheel)),this.releaseAll()}setEnabled(e){const t=!!e;return!t&&this._enabled&&this.releaseAll(),this._enabled=t,this}isEnabled(){return this._enabled}_handleKeyDown(e){const t=e.code;t&&(this._preventDefaultCodes.has(t)&&e.preventDefault(),this._enabled&&(e.repeat||this._keysDown.has(t)||(this._keysDown.add(t),this._keysPressedPending.add(t))))}_handleKeyUp(e){const t=e.code;t&&(this._preventDefaultCodes.has(t)&&e.preventDefault(),this._enabled&&this._keysDown.has(t)&&(this._keysDown.delete(t),this._keysReleasedPending.add(t)))}_handleMouseMove(e){if(!this._enabled)return;const t=this._mouseX,i=this._mouseY;this._updateMousePosition(e.clientX,e.clientY),this._mouseDeltaX+=this._mouseX-t,this._mouseDeltaY+=this._mouseY-i}_handleWheel(e){e.preventDefault(),this._enabled&&(this._updateMousePosition(e.clientX,e.clientY),this._wheelDeltaX+=e.deltaX||0,this._wheelDeltaY+=e.deltaY||0)}_handleMouseDown(e){e.button===bs.MIDDLE&&e.preventDefault(),this._enabled&&(this._updateMousePosition(e.clientX,e.clientY),this._canvas&&typeof this._canvas.focus=="function"&&this._canvas.focus({preventScroll:!0}),this._isValidButton(e.button)&&!this._buttonsDown[e.button]&&(this._buttonsDown[e.button]=!0,this._buttonsPressedPending.add(e.button)))}_handleMouseUp(e){this._enabled&&(this._updateMousePosition(e.clientX,e.clientY),this._isValidButton(e.button)&&this._buttonsDown[e.button]&&(this._buttonsDown[e.button]=!1,this._buttonsReleasedPending.add(e.button)))}_updateMousePosition(e,t){if(this._canvas){const i=this._canvas.getBoundingClientRect();this._mouseX=e-i.left,this._mouseY=t-i.top}else this._mouseX=e,this._mouseY=t}_isValidButton(e){return Number.isInteger(e)&&e>=0&&e<Nc}update(){this._keysJustPressed=this._keysPressedPending,this._keysJustReleased=this._keysReleasedPending,this._keysPressedPending=new Set,this._keysReleasedPending=new Set,this._buttonsJustPressed=this._buttonsPressedPending,this._buttonsJustReleased=this._buttonsReleasedPending,this._buttonsPressedPending=new Set,this._buttonsReleasedPending=new Set,this._lastDeltaX=this._mouseDeltaX,this._lastDeltaY=this._mouseDeltaY,this._mouseDeltaX=0,this._mouseDeltaY=0}clearJustPressed(){this.update()}releaseAll(){this._keysDown.clear(),this._keysPressedPending.clear(),this._keysReleasedPending.clear(),this._keysJustPressed.clear(),this._keysJustReleased.clear(),this._buttonsDown.fill(!1),this._buttonsPressedPending.clear(),this._buttonsReleasedPending.clear(),this._buttonsJustPressed.clear(),this._buttonsJustReleased.clear(),this._mouseDeltaX=0,this._mouseDeltaY=0,this._lastDeltaX=0,this._lastDeltaY=0,this._wheelDeltaX=0,this._wheelDeltaY=0}isKeyPressed(e){return this._keysDown.has(e)}isAnyKeyPressed(){return this._keysDown.size>0}isKeyJustPressed(e){return this._keysJustPressed.has(e)}isKeyJustReleased(e){return this._keysJustReleased.has(e)}getActiveKeys(){return Array.from(this._keysDown)}isMousePressed(e=bs.LEFT){return this._isValidButton(e)&&this._buttonsDown[e]}isMouseJustPressed(e=bs.LEFT){return this._buttonsJustPressed.has(e)}isMouseJustReleased(e=bs.LEFT){return this._buttonsJustReleased.has(e)}getMousePosition(){return{x:this._mouseX,y:this._mouseY}}getMouseDelta(){return{dx:this._lastDeltaX,dy:this._lastDeltaY}}consumeWheelDelta(){if(this._wheelDeltaX===0&&this._wheelDeltaY===0)return null;const e={deltaX:this._wheelDeltaX,deltaY:this._wheelDeltaY,anchorX:this._mouseX,anchorY:this._mouseY};return this._wheelDeltaX=0,this._wheelDeltaY=0,e}getMouseCell(e,t){if(!Number.isFinite(e)||e<=0)throw new RangeError("[InputManager] cellWidth must be positive.");if(!Number.isFinite(t)||t<=0)throw new RangeError("[InputManager] cellHeight must be positive.");return{col:Math.floor(this._mouseX/e),row:Math.floor(this._mouseY/t)}}isMouseInsideCanvas(){if(!this._canvas)return!1;const e=this._canvas.getBoundingClientRect();return this._mouseX>=0&&this._mouseY>=0&&this._mouseX<e.width&&this._mouseY<e.height}setActionMap(e){if(e===null||typeof e!="object")throw new TypeError("[InputManager] action map must be an object.");this._actionMap.clear(),this._codeToActions.clear(),this._preventDefaultCodes.clear();for(const[t,i]of Object.entries(e))this._registerAction(t,i);return this}rebindAction(e,t){return this._unregisterAction(e),this._registerAction(e,t),this}unbindAction(e){return this._unregisterAction(e),this}getBoundCodes(e){const t=this._actionMap.get(e);return t?Array.from(t):[]}exportActionMap(){const e={};for(const[t,i]of this._actionMap)e[t]=Array.from(i);return e}_registerAction(e,t){const i=Array.isArray(t)?t:[t],n=new Set;for(const s of i){if(typeof s!="string"||s.length===0)continue;n.add(s);let a=this._codeToActions.get(s);a||(a=new Set,this._codeToActions.set(s,a)),a.add(e),this._preventDefaultCodes.add(s)}this._actionMap.set(e,n)}_unregisterAction(e){const t=this._actionMap.get(e);if(t){for(const i of t){const n=this._codeToActions.get(i);n&&(n.delete(e),n.size===0&&(this._codeToActions.delete(i),this._preventDefaultCodes.delete(i)))}this._actionMap.delete(e)}}isActionDown(e){const t=this._actionMap.get(e);if(!t)return!1;for(const i of t)if(this._keysDown.has(i))return!0;return!1}isActionJustPressed(e){const t=this._actionMap.get(e);if(!t)return!1;for(const i of t)if(this._keysJustPressed.has(i))return!0;return!1}isActionJustReleased(e){const t=this._actionMap.get(e);if(!t)return!1;for(const i of t)if(this._keysJustReleased.has(i))return!0;return!1}getMovementVector(){let e=0,t=0;if(this.isActionDown("MOVE_LEFT")&&(e-=1),this.isActionDown("MOVE_RIGHT")&&(e+=1),this.isActionDown("MOVE_UP")&&(t-=1),this.isActionDown("MOVE_DOWN")&&(t+=1),e!==0&&t!==0){const i=1/Math.hypot(e,t);e*=i,t*=i}return{x:e,y:t}}}const tx=8,ix=.35,nx=4,sx=6,za=.001,Fc=.5,rx=1.13,ax=64;class Ju{constructor(e={}){if(e===null||typeof e!="object")throw new TypeError("[Camera] options must be an object.");const t=e.viewportWidth,i=e.viewportHeight;if(!Number.isFinite(t)||t<=0)throw new RangeError("[Camera] viewportWidth must be positive and finite.");if(!Number.isFinite(i)||i<=0)throw new RangeError("[Camera] viewportHeight must be positive and finite.");this._viewportW=t,this._viewportH=i,this._cellW=Number.isFinite(e.cellWidth)&&e.cellWidth>0?e.cellWidth:1,this._cellH=Number.isFinite(e.cellHeight)&&e.cellHeight>0?e.cellHeight:1,this._mapCols=0,this._mapRows=0,this._mapW=0,this._mapH=0,this._x=0,this._y=0,this._target=null,this._smoothing=Number.isFinite(e.smoothing)&&e.smoothing>0?e.smoothing:tx,this._shakeDuration=0,this._shakeElapsed=0,this._shakeIntensity=0,this._shakeFrequency=0,this._phaseX=0,this._phaseY=0,this._shakeX=0,this._shakeY=0,this._zoom=1,this._targetZoom=1,this._zoomSmoothing=Number.isFinite(e.zoomSmoothing)&&e.zoomSmoothing>0?e.zoomSmoothing:sx,this._zoomAnchor=null,(e.mapCols||e.mapRows)&&this.setMapSize(e.mapCols||0,e.mapRows||0)}get x(){return this._x}get y(){return this._y}get shakeX(){return this._shakeX}get shakeY(){return this._shakeY}get isShaking(){return this._shakeDuration>0&&this._shakeElapsed<this._shakeDuration}get zoom(){return this._zoom}get targetZoom(){return this._targetZoom}get isZooming(){return Math.abs(this._targetZoom-this._zoom)>za||this._zoomAnchor!==null}get viewportWidth(){return this._viewportW/this._zoom}get viewportHeight(){return this._viewportH/this._zoom}get physicalWidth(){return this._viewportW}get physicalHeight(){return this._viewportH}setTarget(e){if(e!==null&&(typeof e.x!="number"||typeof e.y!="number"))throw new TypeError("[Camera] target must expose numeric x and y.");return this._target=e,this}setMapSize(e,t){const i=Math.max(0,Math.trunc(e)),n=Math.max(0,Math.trunc(t));return this._mapCols=i,this._mapRows=n,this._mapW=i*this._cellW,this._mapH=n*this._cellH,this._x=this._clampAxis(this._x,this._mapW,this.effectiveViewW()),this._y=this._clampAxis(this._y,this._mapH,this.effectiveViewH()),this}setCellMetrics(e,t){if(!Number.isFinite(e)||e<=0)throw new RangeError("[Camera] cellWidth must be positive.");if(!Number.isFinite(t)||t<=0)throw new RangeError("[Camera] cellHeight must be positive.");return this._cellW=e,this._cellH=t,this._mapW=this._mapCols*e,this._mapH=this._mapRows*t,this._x=this._clampAxis(this._x,this._mapW,this.effectiveViewW()),this._y=this._clampAxis(this._y,this._mapH,this.effectiveViewH()),this}setViewport(e,t){if(!Number.isFinite(e)||e<=0)throw new RangeError("[Camera] viewport width must be positive.");if(!Number.isFinite(t)||t<=0)throw new RangeError("[Camera] viewport height must be positive.");return this._viewportW=e,this._viewportH=t,this._x=this._clampAxis(this._x,this._mapW,this.effectiveViewW()),this._y=this._clampAxis(this._y,this._mapH,this.effectiveViewH()),this}setSmoothing(e){if(!Number.isFinite(e)||e<=0)throw new RangeError("[Camera] smoothing must be positive.");return this._smoothing=e,this}effectiveViewW(){return this._viewportW/this._zoom}effectiveViewH(){return this._viewportH/this._zoom}setZoom(e,t,i){if(!Number.isFinite(e)||e<=0)return this;const n=Math.min(nx,Math.max(ix,e));if(n===this._targetZoom)return this;const s=Number.isFinite(t)?t:this._viewportW/2,a=Number.isFinite(i)?i:this._viewportH/2,o=this.screenToWorld(s,a);return this._zoomAnchor={screenX:s,screenY:a,worldX:o.x,worldY:o.y},this._targetZoom=n,this}zoomAt(e,t,i){return!Number.isFinite(e)||e<=0?this:this.setZoom(this._targetZoom*e,t,i)}cancelZoom(){return this._targetZoom=this._zoom,this._zoomAnchor=null,this}update(e){if(!Number.isFinite(e)||e<=0)return this;if(Math.abs(this._targetZoom-this._zoom)>za){const t=1-Math.exp(-this._zoomSmoothing*e);this._zoom+=(this._targetZoom-this._zoom)*t,Math.abs(this._targetZoom-this._zoom)<=za&&(this._zoom=this._targetZoom,this._zoomAnchor=null)}if(this._target){const t=this._viewportW/this._zoom,i=this._viewportH/this._zoom,n=this._target.x-t/2,s=this._target.y-i/2,a=1-Math.exp(-this._smoothing*e);this._x+=(n-this._x)*a,this._y+=(s-this._y)*a,Math.abs(n-this._x)<Fc&&(this._x=n),Math.abs(s-this._y)<Fc&&(this._y=s)}return this._zoomAnchor&&(this._x=this._zoomAnchor.worldX-this._zoomAnchor.screenX/this._zoom,this._y=this._zoomAnchor.worldY-this._zoomAnchor.screenY/this._zoom),this._x=this._clampAxis(this._x,this._mapW,this.effectiveViewW()),this._y=this._clampAxis(this._y,this._mapH,this.effectiveViewH()),this._updateShake(e),this}_clampAxis(e,t,i){if(!Number.isFinite(t)||t<=0)return e;if(t<=i)return(t-i)/2;const n=t-i;return Math.min(Math.max(e,0),n)}shake(e,t,i=25){if(!Number.isFinite(e)||e<=0)return this;if(!Number.isFinite(t)||t<=0)return this;const n=Math.min(t,ax),s=Number.isFinite(i)&&i>0?i:25;if(this.isShaking){const a=this._shakeElapsed/this._shakeDuration,o=(1-a)*(1-a),l=this._shakeIntensity*o;if(n<l)return this}return this._shakeDuration=e,this._shakeElapsed=0,this._shakeIntensity=n,this._shakeFrequency=s,this._phaseX=Math.random()*Math.PI*2,this._phaseY=Math.random()*Math.PI*2,this}cancelShake(){return this._shakeDuration=0,this._shakeElapsed=0,this._shakeX=0,this._shakeY=0,this}_updateShake(e){if(!this.isShaking){(this._shakeX!==0||this._shakeY!==0)&&(this._shakeX=0,this._shakeY=0);return}if(this._shakeElapsed+=e,this._shakeElapsed>=this._shakeDuration){this._shakeDuration=0,this._shakeElapsed=0,this._shakeX=0,this._shakeY=0;return}const t=this._shakeElapsed,i=t/this._shakeDuration,n=(1-i)*(1-i),s=Math.PI*2*this._shakeFrequency*t;this._shakeX=this._shakeIntensity*n*Math.sin(s+this._phaseX),this._shakeY=this._shakeIntensity*n*Math.cos(s*rx+this._phaseY)}snapToTarget(){return this._target?(this._x=this._target.x-this.effectiveViewW()/2,this._y=this._target.y-this.effectiveViewH()/2,this._x=this._clampAxis(this._x,this._mapW,this.effectiveViewW()),this._y=this._clampAxis(this._y,this._mapH,this.effectiveViewH()),this):this}focus(e,t){return this._x=this._clampAxis(e-this.effectiveViewW()/2,this._mapW,this.effectiveViewW()),this._y=this._clampAxis(t-this.effectiveViewH()/2,this._mapH,this.effectiveViewH()),this}worldToScreen(e,t,i=!1){const n=i?this._shakeX:0,s=i?this._shakeY:0;return{x:(e-this._x)*this._zoom+n,y:(t-this._y)*this._zoom+s}}screenToWorld(e,t,i=!1){const n=i?this._shakeX:0,s=i?this._shakeY:0;return{x:(e-n)/this._zoom+this._x,y:(t-s)/this._zoom+this._y}}worldToCell(e,t){return{col:Math.floor(e/this._cellW),row:Math.floor(t/this._cellH)}}cellToWorld(e,t){return{x:e*this._cellW,y:t*this._cellH}}screenToCell(e,t){const i=this.screenToWorld(e,t);return this.worldToCell(i.x,i.y)}isCellVisible(e,t,i=1){const n=Number.isFinite(i)?i:1,s=Math.floor(this._x/this._cellW)-n,a=Math.floor(this._y/this._cellH)-n,o=Math.ceil((this._x+this.effectiveViewW())/this._cellW)+n,l=Math.ceil((this._y+this.effectiveViewH())/this._cellH)+n;return e>=s&&e<o&&t>=a&&t<l}isPointVisible(e,t){return e>=this._x&&t>=this._y&&e<this._x+this.effectiveViewW()&&t<this._y+this.effectiveViewH()}}const He=Object.freeze({DREAM:"DREAM",DRAB:"DRAB"}),pn=Object.freeze({ENERGY_DEPLETED:"ENERGY_DEPLETED",JUICE_CONSUMED:"JUICE_CONSUMED",SCRIPTED:"SCRIPTED",INITIAL:"INITIAL"}),Kt=Object.freeze({IDLE:"IDLE",LOADING:"LOADING",OUT:"OUT",IN:"IN"}),ox=Object.freeze({[He.DREAM]:Object.freeze({name:"The Dream World",description:"Vibrant orange groves, mystic caves, and fictional nature.",grayscale:!1,palette:null,clearColor:255,combatAllowed:!0,weather:Object.freeze({type:"none",intensity:0,lightning:!1})}),[He.DRAB]:Object.freeze({name:"The Drab World",description:"Monochrome city streets under continuous rain.",grayscale:!0,palette:null,clearColor:202116351,combatAllowed:!1,weather:Object.freeze({type:"rain",intensity:.8,lightning:!0})})}),lx=512,cx=120,hx=60;function ux(r){return r<.5?4*r*r*r:1-Math.pow(-2*r+2,3)/2}function Oc(r){return 1-Math.pow(1-r,3)}function Uc(r){const e=Math.sin(r*31.7)*Math.sin(r*17.3)+Math.sin(r*7.9);return Math.min(1,Math.abs(e)/2)}class dx{constructor(e,t={}){if(!e||typeof e.render!="function")throw new TypeError("[WorldManager] A Renderer instance with render() is required.");if(t===null||typeof t!="object")throw new TypeError("[WorldManager] options must be an object.");this._renderer=e,this._outDuration=Number.isFinite(t.outDuration)&&t.outDuration>0?t.outDuration:1.2,this._inDuration=Number.isFinite(t.inDuration)&&t.inDuration>0?t.inDuration:.9,this._switchPoint=Number.isFinite(t.switchPoint)?Math.min(.95,Math.max(.05,t.switchPoint)):.5,this._voidCols=Number.isInteger(t.defaultMapCols)&&t.defaultMapCols>0?t.defaultMapCols:cx,this._voidRows=Number.isInteger(t.defaultMapRows)&&t.defaultMapRows>0?t.defaultMapRows:hx,this._worlds=new Map,this._buffers=new Map,this._events=new Map,this._camera=new Ju({viewportWidth:e.viewportWidth,viewportHeight:e.viewportHeight,cellWidth:e.cellWidth,cellHeight:e.cellHeight,smoothing:8}),this._trackedViewW=e.viewportWidth,this._trackedViewH=e.viewportHeight,this._trackedCellW=e.cellWidth,this._trackedCellH=e.cellHeight,this._transition=this._createIdleTransition(),this._loadToken=0;const i=t.worlds??{};for(const a of Object.values(He))this.registerWorld(a,{...ox[a],...i[a]??{}});const n=t.initialWorld??He.DREAM,s=this._worlds.has(n)?n:He.DREAM;this._activeWorldId=s,this._activeBuffer=this._ensureBuffer(s),this._applyPresentation(this._worlds.get(s)),this._camera.setMapSize(this._activeBuffer.cols,this._activeBuffer.rows),this.emit("worldchanged",{from:null,to:s,reason:pn.INITIAL,world:this._worlds.get(s),rules:this.getActiveRules(),buffer:this._activeBuffer})}registerWorld(e,t){if(typeof e!="string"||e.length===0)throw new TypeError("[WorldManager] world id must be a non-empty string.");if(t===null||typeof t!="object")throw new TypeError("[WorldManager] world definition must be an object.");return this._worlds.set(e,{id:e,...t}),t.buffer?this.setWorldBuffer(e,t.buffer,{silent:!0}):!this._buffers.has(e)&&typeof t.mapLoader!="function"&&this._buffers.set(e,this._createVoidBuffer()),this.emit("worldregistered",{id:e,world:this._worlds.get(e)}),this}setWorldBuffer(e,t,i={}){if(!this._worlds.has(e))throw new RangeError(`[WorldManager] Unknown world id: ${e}`);if(!t||typeof t.cellCount!="number"||!t.charCodes)throw new TypeError("[WorldManager] buffer must be an ASCIIBuffer-compatible grid.");return this._buffers.set(e,t),e===this._activeWorldId&&(this._activeBuffer=t,this._camera.setCellMetrics(this._renderer.cellWidth,this._renderer.cellHeight),this._camera.setMapSize(t.cols,t.rows),this._camera.snapToTarget(),this._renderer.invalidate()),i.silent||this.emit("maploaded",{id:e,buffer:t}),this}async loadWorldBuffer(e){if(!this._worlds.has(e))throw new RangeError(`[WorldManager] Unknown world id: ${e}`);if(this._buffers.has(e))return this._buffers.get(e);const t=this._worlds.get(e);if(typeof t.mapLoader=="function"){const n=await t.mapLoader(e);if(!n||typeof n.cellCount!="number")throw new TypeError(`[WorldManager] mapLoader for ${e} must resolve to an ASCIIBuffer.`);return this.setWorldBuffer(e,n),n}const i=this._createVoidBuffer();return this._buffers.set(e,i),i}requestShift(e,t=pn.SCRIPTED){return this._worlds.has(e)?e===this._activeWorldId&&!this._transition.active?!1:this._transition.active?this._transition.to===e:(this._transition={active:!0,phase:Kt.LOADING,from:this._activeWorldId,to:e,reason:t,elapsed:0,switched:!1,flickerStyle:e===He.DRAB},this.emit("transitionstart",this.getTransitionStatus()),this._buffers.has(e)?this._beginOutPhase():this._loadAndBegin(e,t),!0):(console.warn(`[WorldManager] Shift rejected: unknown world '${e}'.`),!1)}abortTransition(){return this._transition.active?(this._transition.switched?(this._transition.phase=Kt.IN,this._transition.elapsed=this._inDuration):(this._transition=this._createIdleTransition(),this.emit("transitionaborted",{restored:this._activeWorldId})),!0):!1}async _loadAndBegin(e,t){const i=++this._loadToken;try{await this.loadWorldBuffer(e);const n=this._transition;if(i!==this._loadToken||!n.active||n.phase!==Kt.LOADING||n.to!==e)return;this._beginOutPhase()}catch(n){if(console.error(`[WorldManager] Failed to load world '${e}':`,n),i===this._loadToken){const s={to:e,reason:t,error:n};this._transition=this._createIdleTransition(),this.emit("transitionfailed",s)}}}_beginOutPhase(){this._transition.phase=Kt.OUT,this._transition.elapsed=0}_commitWorld(e=null){const t=this._transition.to,i=this._worlds.get(t),n=this._ensureBuffer(t),s=this._activeWorldId;this._activeWorldId=t,this._activeBuffer=n,this._applyPresentation(i),this._camera.setCellMetrics(this._renderer.cellWidth,this._renderer.cellHeight),this._camera.setMapSize(n.cols,n.rows),this._camera.snapToTarget(),e&&e.flickerStyle&&this._camera.shake(.45,6,28),this.emit("worldchanged",{from:s,to:t,reason:e?e.reason:pn.SCRIPTED,world:i,rules:this.getActiveRules(),buffer:n})}_applyPresentation(e){this._renderer.setPalette(e.palette??null),this._renderer.setGrayscale(!!e.grayscale),e.clearColor!==null&&e.clearColor!==void 0?this._renderer.clear(e.clearColor):this._renderer.invalidate()}update(e,t){return t&&typeof t.update=="function"&&t.update(),this._syncRendererMetrics(),this._updateTransition(e),this._camera.update(e),this}render(e,t){const i=this._activeBuffer;if(!i)return;const n=i.commit();n.count>0&&n.count<=lx?e.renderDirty(i,this._camera,n.cells):e.render(i,this._camera)}_syncRendererMetrics(){const e=this._renderer;(e.viewportWidth!==this._trackedViewW||e.viewportHeight!==this._trackedViewH)&&(this._trackedViewW=e.viewportWidth,this._trackedViewH=e.viewportHeight,this._camera.setViewport(e.viewportWidth,e.viewportHeight)),(e.cellWidth!==this._trackedCellW||e.cellHeight!==this._trackedCellH)&&(this._trackedCellW=e.cellWidth,this._trackedCellH=e.cellHeight,this._camera.setCellMetrics(e.cellWidth,e.cellHeight),this._activeBuffer&&this._camera.setMapSize(this._activeBuffer.cols,this._activeBuffer.rows))}_updateTransition(e){const t=this._transition;if(!(!t.active||t.phase===Kt.LOADING)){if(t.elapsed+=e,t.phase===Kt.OUT){!t.switched&&t.elapsed>=this._outDuration*this._switchPoint&&(t.switched=!0,this._commitWorld(t)),t.elapsed>=this._outDuration&&(t.phase=Kt.IN,t.elapsed=0);return}if(t.phase===Kt.IN&&t.elapsed>=this._inDuration){const i=this.getTransitionStatus();this._transition=this._createIdleTransition(),this.emit("transitioncomplete",i)}}}getTransitionStatus(){const e=this._transition;if(!e.active)return{active:!1,phase:Kt.IDLE,from:this._activeWorldId,to:null,reason:null,progress:0,flicker:0,fade:0,switched:!1};let t=0,i=0,n=0;return e.phase===Kt.LOADING?{active:!0,phase:e.phase,from:e.from,to:e.to,reason:e.reason,progress:0,flicker:0,fade:0,switched:!1}:(e.phase===Kt.OUT?(t=Math.min(1,e.elapsed/this._outDuration),e.flickerStyle?i=Math.pow(t,1.5)*(.35+.65*Uc(e.elapsed)):n=ux(t)):e.phase===Kt.IN&&(t=Math.min(1,e.elapsed/this._inDuration),e.flickerStyle?i=(1-Oc(t))*.6*Uc(e.elapsed):n=1-Oc(t)),{active:!0,phase:e.phase,from:e.from,to:e.to,reason:e.reason,progress:t,flicker:i,fade:n,switched:e.switched})}isTransitioning(){return this._transition.active}getActiveWorldId(){return this._activeWorldId}getActiveWorld(){return this._worlds.get(this._activeWorldId)}getActiveBuffer(){return this._activeBuffer}getCamera(){return this._camera}isDream(){return this._activeWorldId===He.DREAM}isDrab(){return this._activeWorldId===He.DRAB}getActiveRules(){const e=this._worlds.get(this._activeWorldId);return{id:this._activeWorldId,name:e.name,combatAllowed:!!e.combatAllowed,weather:e.weather}}isCombatAllowed(){return!!this._worlds.get(this._activeWorldId).combatAllowed}getNetworkSnapshot(){return{world:this._activeWorldId,transitioning:this._transition.active,phase:this._transition.phase}}setPlayerTarget(e){return this._camera.setTarget(e),this}on(e,t){if(typeof t!="function")throw new TypeError("[WorldManager] listener must be a function.");let i=this._events.get(e);return i||(i=new Set,this._events.set(e,i)),i.add(t),()=>this.off(e,t)}once(e,t){const i=n=>{this.off(e,i),t(n)};return this.on(e,i)}off(e,t){const i=this._events.get(e);return i&&(i.delete(t),i.size===0&&this._events.delete(e)),this}emit(e,t){const i=this._events.get(e);if(i)for(const n of i)try{n(t)}catch(s){console.error(`[WorldManager] Listener error on '${e}':`,s)}}_ensureBuffer(e){let t=this._buffers.get(e);return t||(t=this._createVoidBuffer(),this._buffers.set(e,t)),t}_createVoidBuffer(){return new Z({cols:this._voidCols,rows:this._voidRows,defaultChar:" ",defaultFg:3772834047,defaultBg:255})}_createIdleTransition(){return{active:!1,phase:Kt.IDLE,from:this._activeWorldId??null,to:null,reason:null,elapsed:0,switched:!1,flickerStyle:!1}}}const kc=64,Bc=16384,fx=2048,px=9.6,_x=20,bi=96,fr=160,mx=1,Hc=128,Wa=Object.freeze({RAIN:1,SPORE:.45,FOG:.35}),gx=18,xx=.22,yx=4,vx=.07,Sx=1.7,Gc=24,Mx=124,Ex=47,wx=92,Tx=46,Vt=Object.freeze({RAIN:0,SPORE:1,FOG:2}),gi=Object.freeze({DREAM:"DREAM",DRAB:"DRAB"}),zc=4294967295,bx=3941793791,Ax=Object.freeze({35:37,46:58,44:46,126:61,42:43}),Xt=Object.freeze({CLEAR_GROVE:"CLEAR_GROVE",MYSTIC_RAIN:"MYSTIC_RAIN",SPORE_DRIFT:"SPORE_DRIFT",DRAB_DOWNPOUR:"DRAB_DOWNPOUR",DRAB_THUNDERSTORM:"DRAB_THUNDERSTORM"}),pr=Object.freeze({CLEAR_GROVE:Object.freeze({id:Xt.CLEAR_GROVE,world:gi.DREAM,gloom:0,maxLive:80,wind:Object.freeze({x:6,y:0}),gust:Object.freeze({amplitude:5,frequency:.05}),lightning:null,layers:Object.freeze([Object.freeze({kind:Vt.SPORE,rate:2.5,gravity:-6,terminalSpeed:12,speedJitter:.4,lifetime:[6,11],glyphs:Object.freeze([{char:".",weight:3},{char:"*",weight:1}]),lean:!1,colors:Object.freeze([{fg:"#ffd27f"},{fg:"#fff3c4"}]),spawn:"AMBIENT"})])}),MYSTIC_RAIN:Object.freeze({id:Xt.MYSTIC_RAIN,world:gi.DREAM,gloom:.15,maxLive:420,wind:Object.freeze({x:14,y:0}),gust:Object.freeze({amplitude:12,frequency:.09}),lightning:null,layers:Object.freeze([Object.freeze({kind:Vt.RAIN,rate:90,gravity:420,terminalSpeed:260,speedJitter:.25,lifetime:[1.4,2.6],glyphs:Object.freeze([{char:"|",weight:4},{char:"/",weight:2},{char:".",weight:3}]),lean:!0,colors:Object.freeze([{fg:"#7fe3ff"},{fg:"#c48fff"}]),spawn:"TOP"})])}),SPORE_DRIFT:Object.freeze({id:Xt.SPORE_DRIFT,world:gi.DREAM,gloom:.05,maxLive:220,wind:Object.freeze({x:20,y:-4}),gust:Object.freeze({amplitude:16,frequency:.07}),lightning:null,layers:Object.freeze([Object.freeze({kind:Vt.SPORE,rate:16,gravity:-14,terminalSpeed:26,speedJitter:.5,lifetime:[5,9],glyphs:Object.freeze([{char:"*",weight:3},{char:".",weight:4},{char:",",weight:1}]),lean:!1,colors:Object.freeze([{fg:"#ff9ed2"},{fg:"#8affdf"},{fg:"#d6b4ff"}]),spawn:"AMBIENT"})])}),DRAB_DOWNPOUR:Object.freeze({id:Xt.DRAB_DOWNPOUR,world:gi.DRAB,gloom:.55,maxLive:900,wind:Object.freeze({x:-70,y:0}),gust:Object.freeze({amplitude:40,frequency:.12}),lightning:null,layers:Object.freeze([Object.freeze({kind:Vt.RAIN,rate:300,gravity:1400,terminalSpeed:680,speedJitter:.2,lifetime:[.8,1.5],glyphs:Object.freeze([{char:"|",weight:5},{char:"/",weight:3},{char:".",weight:1}]),lean:!0,colors:Object.freeze([{fg:"#7c8b9d"},{fg:"#a9b8c6"}]),spawn:"TOP"}),Object.freeze({kind:Vt.FOG,rate:3,gravity:0,terminalSpeed:30,speedJitter:.3,lifetime:[9,15],glyphs:Object.freeze([{char:"~",weight:4},{char:"-",weight:1}]),lean:!1,colors:Object.freeze([{fg:"rgba(90,102,114,0.55)"}]),spawn:"EDGE"})])}),DRAB_THUNDERSTORM:Object.freeze({id:Xt.DRAB_THUNDERSTORM,world:gi.DRAB,gloom:.7,maxLive:1200,wind:Object.freeze({x:-95,y:0}),gust:Object.freeze({amplitude:60,frequency:.13}),lightning:Object.freeze({meanInterval:8,intensity:[.55,1],strokeCount:[1,3],strokeDuration:[.06,.14],strokeGap:[.05,.13],fullScreenChance:.65,inversionSeconds:.05,shake:Object.freeze({duration:.55,intensity:12,frequency:22})}),layers:Object.freeze([Object.freeze({kind:Vt.RAIN,rate:380,gravity:1600,terminalSpeed:720,speedJitter:.22,lifetime:[.8,1.4],glyphs:Object.freeze([{char:"|",weight:6},{char:"/",weight:3},{char:".",weight:1}]),lean:!0,colors:Object.freeze([{fg:"#8fa0b3"},{fg:"#c2d2e0"}]),spawn:"TOP"}),Object.freeze({kind:Vt.FOG,rate:4,gravity:0,terminalSpeed:34,speedJitter:.3,lifetime:[8,14],glyphs:Object.freeze([{char:"~",weight:4},{char:"-",weight:1}]),lean:!1,colors:Object.freeze([{fg:"rgba(84,96,110,0.6)"}]),spawn:"EDGE"})])})}),Cx=Object.freeze([Xt.CLEAR_GROVE,Xt.MYSTIC_RAIN,Xt.SPORE_DRIFT]),_r=18,mr=40;function Wc(r){let e=r>>>0;return function(){e=e+1831565813|0;let i=Math.imul(e^e>>>15,e|1);return i^=i+Math.imul(i^i>>>7,i|61),((i^i>>>14)>>>0)/4294967296}}class Zu{constructor(e={}){if(e===null||typeof e!="object")throw new TypeError("[WeatherSystem] options must be an object.");const t=e.poolCapacity??fx;if(!Number.isInteger(t)||t<kc||t>Bc)throw new RangeError(`[WeatherSystem] poolCapacity must be an integer in [${kc}, ${Bc}]; received ${t}.`);this._capacity=t,this.setCellMetrics(e.cellWidth??px,e.cellHeight??_x),this.setEmissionScale(e.emissionScale??1);const i=Number.isInteger(e.seed)?e.seed:(Date.now()^Math.random()*4294967295)>>>0;this._rng=Wc(i),this._seed=i,this._px=new Float32Array(t),this._py=new Float32Array(t),this._vx=new Float32Array(t),this._vy=new Float32Array(t),this._gv=new Float32Array(t),this._tv=new Float32Array(t),this._age=new Float32Array(t),this._life=new Float32Array(t),this._phase=new Float32Array(t),this._fg=new Uint32Array(t),this._glyph=new Uint32Array(t),this._kind=new Uint8Array(t),this._lean=new Uint8Array(t),this._count=0,this._time=0,this._windX=0,this._windY=0,this._gustPhaseA=this._rng()*Math.PI*2,this._gustPhaseB=this._rng()*Math.PI*2,this._world=gi.DREAM,this._fromProfile=null,this._toProfile=pr[Xt.CLEAR_GROVE],this._fromLayers=null,this._toLayers=this._buildLayerRuntimes(this._toProfile),this._blend=1,this._blendDuration=1,this._schedulerEnabled=!0,this._nextShiftIn=this._randRange(_r,mr),this._lightningEnabled=!0,this._flash=null,this._nextStrikeIn=this._sampleStrikeDelay(pr[Xt.DRAB_THUNDERSTORM].lightning.meanInterval),this._strikeTimerActive=!1,this._camera=null,this._lastCamX=NaN,this._lastCamY=NaN,this._listeners=new Map,this._metrics={spawnedTotal:0,recycledTotal:0,strikesTotal:0,profileChanges:0,worldChanges:0},this.setWorld(e.world??gi.DREAM)}setSeed(e){if(!Number.isInteger(e)||e<0)throw new RangeError("[WeatherSystem] seed must be a non-negative integer.");return this._seed=e>>>0,this._rng=Wc(this._seed),this._count=0,this._metrics.spawnedTotal=0,this._metrics.recycledTotal=0,this}setCellMetrics(e,t){if(!Number.isFinite(e)||e<=0)throw new RangeError("[WeatherSystem] cellWidth must be positive.");if(!Number.isFinite(t)||t<=0)throw new RangeError("[WeatherSystem] cellHeight must be positive.");return this._cellW=e,this._cellH=t,this}setEmissionScale(e){if(!Number.isFinite(e))throw new RangeError("[WeatherSystem] emissionScale must be finite.");return this._emissionScale=Math.min(2,Math.max(0,e)),this}attachCamera(e){if(e!==null&&(typeof e.x!="number"||typeof e.y!="number"))throw new TypeError("[WeatherSystem] camera must expose numeric x and y.");return this._camera=e,this._lastCamX=NaN,this._lastCamY=NaN,this}setLightningEnabled(e){return this._lightningEnabled=!!e,this}setWorld(e,t={}){if(e!==gi.DREAM&&e!==gi.DRAB)throw new TypeError("[WeatherSystem] world must be DREAM or DRAB.");return this._world=e,this._metrics.worldChanges+=1,e===gi.DRAB?(this._schedulerEnabled=!1,this.setProfile(Xt.DRAB_THUNDERSTORM,{transitionSeconds:t.transitionSeconds??3})):(this._schedulerEnabled=!0,this._nextShiftIn=this._randRange(_r,mr),this.setProfile(Xt.CLEAR_GROVE,{transitionSeconds:t.transitionSeconds??3})),this._dispatch("worldchange",{world:e}),this}setProfile(e,t={}){const i=pr[e];if(!i)throw new RangeError(`[WeatherSystem] Unknown profile: ${e}.`);let n=t.transitionSeconds??3;return Number.isFinite(n)||(n=3),n=Math.min(30,Math.max(0,n)),this._fromProfile=this._toProfile,this._fromLayers=this._toLayers,this._toProfile=i,this._toLayers=this._buildLayerRuntimes(i),this._blend=n===0?1:0,this._blendDuration=Math.max(n,1e-4),this._metrics.profileChanges+=1,this._schedulerEnabled&&(this._nextShiftIn=this._randRange(_r,mr)),i.lightning?(this._nextStrikeIn=this._sampleStrikeDelay(i.lightning.meanInterval),this._strikeTimerActive=!0):this._strikeTimerActive=!1,this._dispatch("profilechange",{from:this._fromProfile?this._fromProfile.id:null,to:i.id,transitionSeconds:n}),this}get world(){return this._world}get activeProfile(){return this._toProfile.id}get isTransitioning(){return this._blend<1}get gloom(){const e=this._easedBlend(),t=this._fromProfile?this._fromProfile.gloom:this._toProfile.gloom;return t+(this._toProfile.gloom-t)*e}get wind(){return{x:this._windX,y:this._windY}}triggerLightning(e={}){const t=this._toProfile.lightning??pr[Xt.DRAB_THUNDERSTORM].lightning;let i=e.intensity;Number.isFinite(i)||(i=this._randRange(t.intensity[0],t.intensity[1])),i=Math.min(1,Math.max(.1,i));let n=null;if(e.region&&Number.isFinite(e.region.u0)&&Number.isFinite(e.region.u1))n={u0:Math.min(e.region.u0,e.region.u1),u1:Math.max(e.region.u0,e.region.u1)};else if(this._rng()>t.fullScreenChance){const s=this._randRange(.3,.6),a=this._rng()*(1-s);n={u0:a,u1:a+s}}return this._executeStrike(t,i,n),this}get isFlashing(){return this._flash!==null&&this.flashIntensity>.02}get flashIntensity(){if(!this._flash)return 0;const e=this._flash.elapsed;let t=0;for(let i=0;i<this._flash.strokes.length;i+=1){const n=this._flash.strokes[i],s=e-n.t;if(s>=0&&s<n.duration){const a=1-s/n.duration,o=n.intensity*a*a;o>t&&(t=o)}}return t}getFlashState(){return{active:this.isFlashing,intensity:this.flashIntensity,region:this._flash?this._flash.region:null}}addEventListener(e,t){if(typeof e!="string"||e.length===0)throw new TypeError("[WeatherSystem] event type must be a string.");if(typeof t!="function")throw new TypeError("[WeatherSystem] listener must be a function.");let i=this._listeners.get(e);return i||(i=new Set,this._listeners.set(e,i)),i.add(t),this}removeEventListener(e,t){const i=this._listeners.get(e);return i&&(i.delete(t),i.size===0&&this._listeners.delete(e)),this}_dispatch(e,t){const i=this._listeners.get(e);if(i)for(const n of i)try{n(t)}catch(s){console.error(`[WeatherSystem] '${e}' listener failed:`,s)}}update(e){if(!Number.isFinite(e)||e<=0)return this;this._time+=e,this._advanceBlend(e),this._resolveWind(),this._advanceScheduler(e),this._advanceLightning(e);const t=this._camera;if(!t)return this;if(Number.isFinite(this._lastCamX)){const s=t.x-this._lastCamX,a=t.y-this._lastCamY,o=Math.hypot(t.viewportWidth,t.viewportHeight);Math.hypot(s,a)>o*mx&&this.clearParticles()}this._lastCamX=t.x,this._lastCamY=t.y;const i=this._effectiveMaxLive(),n=this._easedBlend();return this._fromLayers&&this._blend<1?(this._emitFromLayers(this._fromLayers,1-n,e,t,i),this._emitFromLayers(this._toLayers,n,e,t,i)):this._emitFromLayers(this._toLayers,1,e,t,i),this._integrateParticles(e,t),this}_advanceBlend(e){this._blend>=1||(this._blend=Math.min(1,this._blend+e/this._blendDuration),this._blend>=1&&(this._fromProfile=null,this._fromLayers=null))}_easedBlend(){const e=Math.min(1,Math.max(0,this._blend));return e*e*(3-2*e)}_resolveWind(){const e=this._easedBlend(),t=this._fromProfile?this._fromProfile.wind:this._toProfile.wind,i=this._toProfile.wind,n=t.x+(i.x-t.x)*e,s=t.y+(i.y-t.y)*e,a=this._fromProfile?this._fromProfile.gust:this._toProfile.gust,o=this._toProfile.gust,l=a.amplitude+(o.amplitude-a.amplitude)*e,c=a.frequency+(o.frequency-a.frequency)*e,h=Math.PI*2*c*this._time+this._gustPhaseA,d=Math.PI*2*c*Sx*this._time+this._gustPhaseB,u=l*(.6*Math.sin(h)+.4*Math.sin(d));this._windX=n+u,this._windY=s}_advanceScheduler(e){if(!this._schedulerEnabled||this._world!==gi.DREAM||(this._nextShiftIn-=e,this._nextShiftIn>0))return;const t=Cx.filter(n=>n!==this._toProfile.id),i=t[Math.floor(this._rng()*t.length)];this.setProfile(i,{transitionSeconds:this._randRange(3,6)})}_advanceLightning(e){const t=this._toProfile.lightning;if(!(!t||!this._lightningEnabled||!this._strikeTimerActive)&&!this._flash&&(this._nextStrikeIn-=e,this._nextStrikeIn<=0)){const i=this._randRange(t.intensity[0],t.intensity[1]);let n=null;if(this._rng()>t.fullScreenChance){const s=this._randRange(.3,.6),a=this._rng()*(1-s);n={u0:a,u1:a+s}}this._executeStrike(t,i,n),this._nextStrikeIn=this._sampleStrikeDelay(t.meanInterval)}}_sampleStrikeDelay(e){const t=this._rng(),i=-e*Math.log(1-t);return Math.min(e*4,Math.max(1.25,i))}_executeStrike(e,t,i){const n=Math.max(1,Math.round(this._randRange(e.strokeCount[0],e.strokeCount[1]))),s=[];let a=0;for(let c=0;c<n;c+=1){const h=this._randRange(e.strokeDuration[0],e.strokeDuration[1]);s.push({t:a,duration:h,intensity:t*(c===0?1:this._randRange(.5,.9))}),a+=h+this._randRange(e.strokeGap[0],e.strokeGap[1])}this._flash={elapsed:0,total:a,strokes:s,inversionRemaining:e.inversionSeconds,region:i,intensity:t},this._metrics.strikesTotal+=1;const o=this._camera;o&&typeof o.shake=="function"&&o.shake(e.shake.duration,e.shake.intensity*t,e.shake.frequency);const l={intensity:t,fullScreen:i===null,region:i,world:this._world,strokeCount:n};this._dispatch("lightning",l)}_buildLayerRuntimes(e){return e.layers.map(t=>{const i=t.glyphs.reduce((l,c)=>l+c.weight,0),n=new Uint32Array(t.glyphs.length),s=new Float64Array(t.glyphs.length);let a=0;for(let l=0;l<t.glyphs.length;l+=1)n[l]=t.glyphs[l].char.codePointAt(0),a+=t.glyphs[l].weight/i,s[l]=a;s[s.length-1]=1;const o=t.colors.map(l=>Z.packColor(l.fg,zc));return{spec:t,accumulator:0,glyphCodes:n,cumulative:s,colors:o}})}_emitFromLayers(e,t,i,n,s){if(!(t<=0||this._emissionScale<=0))for(let a=0;a<e.length;a+=1){const o=e[a];o.accumulator+=o.spec.rate*t*this._emissionScale*i;let l=Math.floor(o.accumulator);if(o.accumulator-=l,!(l<=0)){l>Hc&&(l=Hc,o.accumulator=0);for(let c=0;c<l;c+=1){if(this._count>=this._capacity||this._count>=s){o.accumulator=0;return}this._spawnParticle(o,n)}}}}_spawnParticle(e,t){const i=e.spec,n=this._count,s=this._rng,a=1+(s()*2-1)*i.speedJitter,o=Math.max(1,i.terminalSpeed*a),l=Wa[Object.keys(Vt)[i.kind]]??1;let c=0,h=0;if(i.kind===Vt.RAIN){const d=(t.viewportHeight+bi*2)/o,u=this._windX*d,f=t.x-bi+Math.min(0,u),m=t.x+t.viewportWidth+bi+Math.max(0,u);c=f+s()*(m-f),h=t.y-bi*s()-2,this._vy[n]=o*this._randRange(.3,.7)}else i.kind===Vt.SPORE?(c=t.x-bi+s()*(t.viewportWidth+bi*2),h=t.y-bi+s()*(t.viewportHeight+bi*2),this._vy[n]=(s()*2-1)*o*.3):(c=this._windX>=0?t.x-bi:t.x+t.viewportWidth+bi,h=t.y+s()*t.viewportHeight,this._vy[n]=0);this._px[n]=c,this._py[n]=h,this._vx[n]=this._windX*l+(s()*2-1)*8,this._gv[n]=i.gravity,this._tv[n]=o,this._age[n]=0,this._life[n]=this._randRange(i.lifetime[0],i.lifetime[1]),this._phase[n]=s()*Math.PI*2,this._glyph[n]=this._sampleGlyph(e),this._fg[n]=e.colors[Math.floor(s()*e.colors.length)],this._kind[n]=i.kind,this._lean[n]=i.lean?1:0,this._count+=1,this._metrics.spawnedTotal+=1}_sampleGlyph(e){const t=this._rng();for(let i=0;i<e.cumulative.length;i+=1)if(t<=e.cumulative[i])return e.glyphCodes[i];return e.glyphCodes[e.glyphCodes.length-1]}_integrateParticles(e,t){const i=1-Math.exp(-3.2*e),n=t.x-fr,s=t.x+t.viewportWidth+fr,a=t.y-fr,o=t.y+t.viewportHeight+fr;let l=0;for(;l<this._count;){const c=this._kind[l];if(this._age[l]+=e,c===Vt.RAIN)this._vx[l]+=(this._windX-this._vx[l])*i,this._vy[l]+=this._gv[l]*e,this._vy[l]>this._tv[l]&&(this._vy[l]=this._tv[l]);else if(c===Vt.SPORE){const d=gx*Math.sin(Math.PI*2*xx*this._age[l]+this._phase[l]);this._vx[l]=this._windX*Wa.SPORE+d,this._vy[l]+=this._gv[l]*e,this._vy[l]<-this._tv[l]&&(this._vy[l]=-this._tv[l]),this._vy[l]>this._tv[l]&&(this._vy[l]=this._tv[l])}else{const d=this._windX*Wa.FOG;this._vx[l]+=(d-this._vx[l])*i,this._vy[l]=yx*Math.sin(Math.PI*2*vx*this._age[l]+this._phase[l])}this._px[l]+=this._vx[l]*e,this._py[l]+=this._vy[l]*e,this._age[l]>=this._life[l]||this._px[l]<n||this._px[l]>s||this._py[l]<a||this._py[l]>o?(this._swapRemove(l),this._metrics.recycledTotal+=1):l+=1}this._flash&&(this._flash.elapsed+=e,this._flash.inversionRemaining>0&&(this._flash.inversionRemaining-=e),this._flash.elapsed>=this._flash.total&&(this._flash=null))}_swapRemove(e){const t=this._count-1;e!==t&&(this._px[e]=this._px[t],this._py[e]=this._py[t],this._vx[e]=this._vx[t],this._vy[e]=this._vy[t],this._gv[e]=this._gv[t],this._tv[e]=this._tv[t],this._age[e]=this._age[t],this._life[e]=this._life[t],this._phase[e]=this._phase[t],this._fg[e]=this._fg[t],this._glyph[e]=this._glyph[t],this._kind[e]=this._kind[t],this._lean[e]=this._lean[t]),this._count=t}_effectiveMaxLive(){const e=this._easedBlend(),t=this._fromProfile?this._fromProfile.maxLive:this._toProfile.maxLive;return Math.round(t+(this._toProfile.maxLive-t)*e)}render(e,t=this._camera){if(!(e instanceof Z))throw new TypeError("[WeatherSystem] render requires an ASCIIBuffer.");if(!t)return 0;const i=t.x,n=t.y,s=this._cellW,a=this._cellH,l=this.flashIntensity>.35;let c=0;for(let h=0;h<this._count;h+=1){const d=Math.floor((this._px[h]-i)/s),u=Math.floor((this._py[h]-n)/a);if(d<0||d>=e.cols||u<0||u>=e.rows)continue;let f=this._glyph[h];this._lean[h]===1&&f!==Tx&&(this._windX<-Gc?f=Ex:this._windX>Gc?f=wx:f=Mx);let m=this._fg[h];const y=this._kind[h];if(l&&y===Vt.RAIN)m=zc;else if(y!==Vt.RAIN){const p=Math.min(1,this._age[h]/this._life[h]),_=Math.round(Math.sin(Math.PI*p)*255);m=m&4294967040|_&255}e.setChar(d,u,f,m,null),c+=1}return this._flash&&this._flash.inversionRemaining>0&&this._applyInversion(e,this._flash.region),c}_applyInversion(e,t){const i=e.cols,n=e.rows,s=t?Math.max(0,Math.floor(t.u0*i)):0,a=t?Math.min(i,Math.ceil(t.u1*i)):i;if(s>=a)return;const o=e.charCodes,l=e.foregroundColors,c=e.backgroundColors;for(let h=0;h<n;h+=1){let d=h*i+s;for(let u=s;u<a;u+=1,d+=1){const f=o[d],m=l[d];let y=c[d];y&255||(y=bx);const p=Ax[f]??f;e.setChar(u,h,p,y,m)}}}_randRange(e,t){return e+this._rng()*(t-e)}clearParticles(){return this._count=0,this}get liveCount(){return this._count}get poolCapacity(){return this._capacity}getMetrics(){return{liveParticles:this._count,poolCapacity:this._capacity,spawnedTotal:this._metrics.spawnedTotal,recycledTotal:this._metrics.recycledTotal,strikesTotal:this._metrics.strikesTotal,profileChanges:this._metrics.profileChanges,worldChanges:this._metrics.worldChanges,profile:this._toProfile.id,world:this._world,gloom:this.gloom,windX:Math.round(this._windX*10)/10,flashing:this.isFlashing,transitioning:this.isTransitioning,seed:this._seed}}reset(){return this.clearParticles(),this._flash=null,this._toProfile.lightning&&(this._nextStrikeIn=this._sampleStrikeDelay(this._toProfile.lightning.meanInterval)),this._nextShiftIn=this._randRange(_r,mr),this._lastCamX=NaN,this._lastCamY=NaN,this}destroy(){this._camera=null,this._listeners.clear(),this.clearParticles()}}const Rx=.14,Px=.15,Ix=2.4,Dx=.45,Lx=5,Nx=32,Fx=3,ms=2.6,Ox=.55,Ux=.15,kx=12,Vc=30,Bx=72,Hx=9608,Gx=9617,Xc=9472,qc=9474,Va=9484,Yc=9488,$c=9492,Kc=9496,zx=9660,Xa=62,qa=Object.freeze([9617,9618,9619,9608,61,42]),gs=Z.packColor("rgba(8, 10, 16, 0.92)"),Wx=Z.packColor("#9ad7ff"),$n=Z.packColor("#ffe9c4"),Wt=Z.packColor("#d7e3ee"),jt=Z.packColor("#6d7c8c"),jc=Z.packColor("#6dff7c"),Vx=Z.packColor("#ffd24a"),Ya=Z.packColor("#ff5a5a"),Xx=Z.packColor("#7fa9ff"),$a=Z.packColor("#ff7700"),qx=Z.packColor("#ff3d2e"),Yx=Z.packColor("#8affdf"),Ka=Z.packColor("#ffd24a"),xs=Z.packColor("#ffd27f"),$x=Z.packColor("#f4ecdc"),Kx=Z.packColor("#ff9e3d"),gr=Object.freeze({info:Z.packColor("#9ad7ff"),quest:Z.packColor("#ffd24a"),success:Z.packColor("#7dff8a"),warning:Z.packColor("#ff8a5a"),levelup:Z.packColor("#ff9ed2")}),jx=Object.freeze({LOCKED:Z.packColor("#5a6672"),AVAILABLE:Z.packColor("#ffd24a"),ACTIVE:Z.packColor("#ff9e3d"),READY:Z.packColor("#7dff8a"),COMPLETED:Z.packColor("#8fa0b3")}),It=Object.freeze({INVENTORY:"inventory",QUEST_LOG:"questlog",SHOP:"shop",PAUSE:"pause"});function li(r){return r<0?0:r>1?1:r}function yt(r,e){return typeof r=="number"&&Number.isFinite(r)?r:e}function xr(r){const e=li(r);return 1-Math.pow(1-e,3)}function Jx(r){const e=li(r);return e<.5?4*e*e*e:1-Math.pow(-2*e+2,3)/2}function Zx(r){const e=li(r);return e*e*(3-2*e)}function Kn(r){const e=Math.sin(r*31.7)*Math.sin(r*17.3)+Math.sin(r*7.9);return Math.min(1,Math.abs(e)/2)}function tt(r,e){const t=li(e),i=r>>>0,n=i&255,s=Math.round(n*t);return(i&4294967040|s&255)>>>0}function Qx(r,e){const t=Math.round(li(r)*e),i=String.fromCodePoint(Hx).repeat(t),n=String.fromCodePoint(Gx).repeat(e-t);return i+n}class ey{constructor(e,t={}){if(!e||typeof e.drawString!="function"||typeof e.drawRect!="function")throw new TypeError("[UIManager] A Renderer with drawString()/drawRect() is required.");if(t===null||typeof t!="object")throw new TypeError("[UIManager] options must be an object.");this._renderer=e,this._showHintLine=t.showHintLine!==!1,this._showHud=t.showHud!==!1,this._time=0,this._panelSpecs=new Map,this._stack=[],this._cursors=new Map,this._scrolls=new Map,this._openedAt=new Map,this._toasts=[],this._floating=[],this._announceQueue=[],this._nextToastId=1,this._dialogueView=null,this._hint=null,this._player=null,this._questSystem=null,this._inventory=null,this._shop=null,this._camera=null,this._worldManager=null,this._listeners=new Map,this._metrics={panelsOpened:0,panelsClosed:0,toastsShown:0,toastsEvicted:0,announcements:0,floatingTexts:0},this._registerBuiltinPanels()}attachPlayer(e){return this._player=e,this}attachQuestSystem(e){return this._questSystem=e,this}attachInventory(e){return this._inventory=e,this}attachShop(e){return this._shop=e,this}attachCamera(e){return this._camera=e,this}attachWorldManager(e){return this._worldManager=e,this}setDialogueView(e){return this._dialogueView=e&&e.active?e:null,this}clearDialogueView(){return this._dialogueView=null,this}isDialogueOpen(){return this._dialogueView!==null}setHint(e){return this._hint=typeof e=="string"&&e.length>0?e:null,this}_registerBuiltinPanels(){this.registerPanel({id:It.INVENTORY,title:"SATCHEL",listDriven:!0,widthFraction:.44,minWidthCells:30,maxWidthCells:48}),this.registerPanel({id:It.QUEST_LOG,title:"LOOM RECORDS",listDriven:!0,widthFraction:.5,minWidthCells:34,maxWidthCells:58}),this.registerPanel({id:It.SHOP,title:"ORANGE JUICE CART",listDriven:!0,widthFraction:.48,minWidthCells:32,maxWidthCells:54}),this.registerPanel({id:It.PAUSE,title:"THE HOUR HOLDS",blocking:!0,listDriven:!1,widthFraction:.4,minWidthCells:28,maxWidthCells:44,heightFraction:.5,minHeightCells:12,maxHeightCells:22})}registerPanel(e){if(e===null||typeof e!="object")throw new TypeError("[UIManager] panel spec must be an object.");if(typeof e.id!="string"||e.id.length===0)throw new RangeError("[UIManager] panel spec needs a non-empty id.");const t={id:e.id,title:typeof e.title=="string"?e.title:e.id.toUpperCase(),blocking:e.blocking!==!1,listDriven:!!e.listDriven,widthFraction:yt(e.widthFraction,.5),minWidthCells:yt(e.minWidthCells,30),maxWidthCells:yt(e.maxWidthCells,58),heightFraction:yt(e.heightFraction,.62),minHeightCells:yt(e.minHeightCells,12),maxHeightCells:yt(e.maxHeightCells,30),draw:typeof e.draw=="function"?e.draw:null};return this._panelSpecs.set(t.id,Object.freeze(t)),this}openPanel(e){if(!this._panelSpecs.has(e))return console.warn(`[UIManager] openPanel: unknown panel '${e}'.`),!1;const t=this._stack.indexOf(e);return t!==-1?(this._stack.splice(t,1),this._stack.push(e),this._dispatch("panelfocused",{id:e}),!0):(this._stack.push(e),this._cursors.set(e,0),this._scrolls.set(e,0),this._openedAt.set(e,this._time),this._metrics.panelsOpened+=1,this._dispatch("panelopened",{id:e}),!0)}closePanel(e){const t=this._stack.indexOf(e);return t===-1?!1:(this._stack.splice(t,1),this._openedAt.delete(e),this._metrics.panelsClosed+=1,this._dispatch("panelclosed",{id:e}),!0)}togglePanel(e){return this._stack.includes(e)?(this.closePanel(e),!1):this.openPanel(e)}closeTopPanel(){return this._stack.length===0?!1:this.closePanel(this._stack[this._stack.length-1])}closeAllPanels(){let e=0;for(;this._stack.length>0;)this.closePanel(this._stack[this._stack.length-1]),e+=1;return e}isPanelOpen(e){return this._stack.includes(e)}getTopPanelId(){return this._stack.length>0?this._stack[this._stack.length-1]:null}hasBlockingPanel(){if(this.isDialogueOpen())return!0;for(let e=0;e<this._stack.length;e+=1){const t=this._panelSpecs.get(this._stack[e]);if(t&&t.blocking)return!0}return!1}isGameplayInputBlocked(){return this.hasBlockingPanel()}notify(e,t={}){if(typeof e!="string"||e.length===0)return-1;const i=gr[t.kind]!==void 0?t.kind:"info";this._toasts.length>=Lx&&(this._toasts.shift(),this._metrics.toastsEvicted+=1);const n=this._nextToastId++,s=t.color!==void 0?Z.packColor(t.color,gr[i]):gr[i],a={id:n,kind:i,lines:this._wrapText(e,Vc-2),born:this._time,fadeIn:Px,hold:yt(t.hold,Ix),fadeOut:Dx,fg:s};return this._toasts.push(a),this._metrics.toastsShown+=1,this._dispatch("toast",{id:n,kind:i,text:e}),n}announce(e,t={}){return typeof e!="string"||e.length===0?this:(this._announceQueue.length>=Fx&&this._announceQueue.shift(),this._announceQueue.push({text:e,sub:typeof t.sub=="string"?t.sub:null,born:this._time,fg:Z.packColor(t.color??"#ff9ed2",gr.levelup)}),this._metrics.announcements+=1,this._dispatch("announce",{text:e}),this)}floatingText(e,t,i,n={}){if(typeof i!="string"||i.length===0)return this;if(!Number.isFinite(e)||!Number.isFinite(t))return this;this._floating.length>=Nx&&this._floating.shift();let s=e,a=t;if(this._camera&&typeof this._camera.worldToScreen=="function"){const o=this._camera.worldToScreen(e,t);s=o.x,a=o.y}return this._floating.push({worldX:s,worldY:a,text:i,fg:Z.packColor(n.color??"#ffffff",4294967295),born:this._time,life:Math.max(.1,yt(n.life,1)),rise:Math.max(0,yt(n.rise,30))}),this._metrics.floatingTexts+=1,this}clearNotifications(){return this._toasts.length=0,this._floating.length=0,this._announceQueue.length=0,this}addEventListener(e,t){if(typeof e!="string"||e.length===0)throw new TypeError("[UIManager] event type must be a string.");if(typeof t!="function")throw new TypeError("[UIManager] listener must be a function.");let i=this._listeners.get(e);return i||(i=new Set,this._listeners.set(e,i)),i.add(t),()=>this.removeEventListener(e,t)}removeEventListener(e,t){const i=this._listeners.get(e);return i&&(i.delete(t),i.size===0&&this._listeners.delete(e)),this}_dispatch(e,t){const i=this._listeners.get(e);if(i)for(const n of i)try{n(t)}catch(s){console.error(`[UIManager] '${e}' listener failed:`,s)}}update(e,t){return!Number.isFinite(e)||e<=0?this:(this._time+=e,t&&typeof t.isActionJustPressed=="function"&&(this._handleWindowKeys(t),this._handlePanelNavigation(t)),this._advanceEffects(),this)}_handleWindowKeys(e){this.isDialogueOpen()||(e.isActionJustPressed("INVENTORY")&&this.togglePanel(It.INVENTORY),e.isActionJustPressed("QUEST_LOG")&&this.togglePanel(It.QUEST_LOG),e.isActionJustPressed("PAUSE")&&(this._stack.length>0?this.closeTopPanel():this.togglePanel(It.PAUSE)))}_handlePanelNavigation(e){const t=this.getTopPanelId();if(!t)return;const i=this._panelSpecs.get(t);if(!i||!i.listDriven)return;const n=this._readPanelItems(t),s=n.length;if(e.isActionJustPressed("MOVE_UP")&&s>0){const a=this._cursors.get(t)??0;this._cursors.set(t,(a-1+s)%s),this._keepCursorVisible(t,s)}if(e.isActionJustPressed("MOVE_DOWN")&&s>0){const a=this._cursors.get(t)??0;this._cursors.set(t,(a+1)%s),this._keepCursorVisible(t,s)}e.isActionJustPressed("ACTION")&&s>0&&this._activateSelection(t,n)}_keepCursorVisible(e,t){const i=this._cursors.get(e)??0,n=this._panelVisibleRows(e);let s=this._scrolls.get(e)??0;i<s&&(s=i),i>=s+n&&(s=i-n+1),s=Math.max(0,Math.min(s,Math.max(0,t-n))),this._scrolls.set(e,s)}_panelVisibleRows(e){const t=this._panelSpecs.get(e);if(!t)return 1;const i=this._gridSize(),n=Math.max(t.minHeightCells,Math.min(t.maxHeightCells,Math.floor(i.rows*t.heightFraction)));return Math.max(1,n-6)}_advanceEffects(){for(let e=this._toasts.length-1;e>=0;e-=1){const t=this._toasts[e],i=t.fadeIn+t.hold+t.fadeOut;this._time-t.born>=i&&this._toasts.splice(e,1)}for(let e=this._floating.length-1;e>=0;e-=1)this._time-this._floating[e].born>=this._floating[e].life&&this._floating.splice(e,1);if(this._announceQueue.length>0){const e=this._announceQueue[0];this._time-e.born>=ms&&this._announceQueue.shift()}}_readInventoryItems(){const e=this._inventory;if(!e)return[];let t=[];try{typeof e.getSlots=="function"?t=e.getSlots():Array.isArray(e.items)?t=e.items:Array.isArray(e.slots)&&(t=e.slots)}catch(i){return console.error("[UIManager] inventory read failed:",i),[]}return Array.isArray(t)?t.map(i=>{const n=i&&typeof i=="object"?i:{},s=typeof n.glyph=="string"&&n.glyph.length>0?n.glyph:"?";return{name:typeof n.name=="string"?n.name:"Unknown wanderer",glyph:Array.from(s)[0],count:Math.max(1,Math.round(yt(n.count,1))),description:typeof n.description=="string"?n.description:""}}):[]}_readQuestItems(){const e=this._questSystem;if(!e)return[];let t=[];try{typeof e.listQuests=="function"?t=e.listQuests():Array.isArray(e.quests)&&(t=e.quests)}catch(i){return console.error("[UIManager] quest read failed:",i),[]}return Array.isArray(t)?t.map(i=>{const n=i&&typeof i=="object"?i:{};return{id:typeof n.id=="string"?n.id:"quest",title:typeof n.title=="string"?n.title:n.id??"Untitled",status:typeof n.status=="string"?n.status:"ACTIVE",objective:typeof n.objective=="string"?n.objective:""}}):[]}_readShopItems(){const e=this._shop;return!e||!Array.isArray(e.items)?[]:e.items.map(t=>{const i=t&&typeof t=="object"?t:{},n=typeof i.glyph=="string"&&i.glyph.length>0?i.glyph:"o";return{name:typeof i.name=="string"?i.name:"Wares",price:Math.max(0,Math.round(yt(i.price,0))),glyph:Array.from(n)[0],stock:Math.round(yt(i.stock,1/0))}})}_readPanelItems(e){switch(e){case It.INVENTORY:return this._readInventoryItems();case It.QUEST_LOG:return this._readQuestItems();case It.SHOP:return this._readShopItems();default:return[]}}_activateSelection(e,t){const i=this._cursors.get(e)??0,n=t[i];if(n)try{if(e===It.INVENTORY){const s=this._inventory;if(s&&typeof s.useItem=="function"){const a=s.useItem(i);this.notify(a?`Used ${n.name}.`:`Cannot use ${n.name} here.`,{kind:a?"success":"warning"})}else this.notify(`${n.name}: no usable action attuned.`,{kind:"info"})}else if(e===It.QUEST_LOG){const s=this._questSystem;s&&typeof s.trackQuest=="function"?(s.trackQuest(n.id),this.notify(`Tracking: ${n.title}`,{kind:"quest"})):n.objective&&this.notify(n.objective,{kind:"quest"})}else e===It.SHOP&&this._attemptPurchase(i,n)}catch(s){console.error(`[UIManager] selection action failed in '${e}':`,s),this.notify("The action fizzles.",{kind:"warning"})}}_attemptPurchase(e,t){const i=this._shop,n=i&&typeof i.currencyName=="string"?i.currencyName:"orange scrip",s=yt(this._player?this._player.currency:0,0);if(t.price>s){this.notify(`Not enough ${n} for ${t.name}.`,{kind:"warning"});return}let a=!1;i&&typeof i.purchase=="function"&&(a=!!i.purchase(e)),this.notify(a?`Bought ${t.name}.`:"The keeper shakes their head.",{kind:a?"success":"warning"})}render(e=1){const t=this._gridSize();if(t.columns<20||t.rows<10)return;const i=this.hasBlockingPanel();this._showHud&&this._drawHUD(i?Ox:1);for(let n=0;n<this._stack.length;n+=1){const s=n===this._stack.length-1;this._drawPanel(this._stack[n],s)}this._dialogueView&&this._drawDialogue(this._dialogueView,t),this._drawToasts(t),this._drawFloating(),this._drawAnnouncement(t),this._drawTransitionOverlay(t)}_gridSize(){const e=this._renderer,t=e.cellWidth>0?e.cellWidth:9.6,i=e.cellHeight>0?e.cellHeight:20;let n,s;if(typeof e.getViewportGridSize=="function"){const a=e.getViewportGridSize();n=a.columns,s=a.rows}else n=Math.max(1,Math.ceil(e.viewportWidth/t)),s=Math.max(1,Math.ceil(e.viewportHeight/i));return{columns:n,rows:s,cellW:t,cellH:i}}_panelGeometry(e,t){const i=Math.max(e.minWidthCells,Math.min(e.maxWidthCells,Math.floor(t.columns*e.widthFraction))),n=Math.max(e.minHeightCells,Math.min(e.maxHeightCells,Math.floor(t.rows*e.heightFraction))),s=Math.floor((t.columns-i)/2),a=Math.floor((t.rows-n)/2);return{x0:s,y0:a,cols:i,rows:n,px:s*t.cellW,py:a*t.cellH,wPx:i*t.cellW,hPx:n*t.cellH,innerX:s+2,innerY:a+2,innerCols:Math.max(1,i-4),innerRows:Math.max(1,n-4)}}_drawHUD(e){const t=this._renderer,i=this._gridSize(),n=i.cellW;let s=1;const a=C=>C*i.cellH,o=(C,g=1)=>tt(C,e*g),l=this._player;if(!l){t.drawString(n,a(s),"NO THREAD ATTUNED",o(jt));return}const c=typeof l.name=="string"?l.name:"Custodian",h=yt(l.level,1);let d="DREAM",u=$a;if(this._worldManager&&typeof this._worldManager.getActiveWorldId=="function")try{d=String(this._worldManager.getActiveWorldId()),u=d==="DRAB"?jt:$a}catch{}t.drawString(n,a(s),`${c}  Lv.${h}  [${d}]`,o(Wt)),s+=1;const f=yt(l.hp,0),m=yt(l.maxHp,0),y=m>0?f/m:0,p=y>.5?jc:y>.25?Vx:Ya;this._drawStatusBar(n,a(s),"HP    ",y,p,`${Math.ceil(f)}/${Math.ceil(m)}`,e),s+=1,Number.isFinite(l.mp)&&Number.isFinite(l.maxMp)&&l.maxMp>0&&(this._drawStatusBar(n,a(s),"MP    ",l.mp/l.maxMp,Xx,`${Math.ceil(l.mp)}/${Math.ceil(l.maxMp)}`,e),s+=1);const _=yt(l.oranges,0),T=yt(l.maxOranges,20),A=Number.isFinite(l.energyFraction)?l.energyFraction:T>0?_/T:0,S=A<Ux;let M=e,E=$a;if(S&&(M=e*(.45+.55*Kn(this._time*1.8)),E=qx),this._drawStatusBar(n,a(s),"ORANGE",A,E,`${Math.ceil(_)}/${Math.ceil(T)}`,M),s+=1,Number.isFinite(l.currency)){const C=typeof l.currencyName=="string"?l.currencyName:"scrip";t.drawString(n,a(s),`${C}: ${Math.floor(l.currency)}`,o(Ka)),s+=1}if(Array.isArray(l.cooldowns))for(let C=0;C<l.cooldowns.length&&s<i.rows-2;C+=1){const g=l.cooldowns[C];if(!g||!Number.isFinite(g.remaining)||g.remaining<=0)continue;const w=yt(g.duration,g.remaining),R=w>0?1-g.remaining/w:1,P=String(g.name??"skill").slice(0,8).padEnd(8," ");this._drawStatusBar(n,a(s),P,R,Yx,`${g.remaining.toFixed(1)}s`,e,8),s+=1}if(Array.isArray(l.party)&&l.party.length>0){s+=1,t.drawString(n,a(s),"PARTY",o(jt)),s+=1;for(let C=0;C<l.party.length&&s<i.rows-1;C+=1){const g=l.party[C];if(!g||typeof g.name!="string")continue;const w=yt(g.maxHp,0),R=w>0?yt(g.hp,0)/w:0;this._drawStatusBar(n+i.cellW,a(s),g.name.slice(0,10).padEnd(10," "),R,R>.25?jc:Ya,`${Math.round(R*100)}%`,e,6),s+=1}}if(this._showHintLine&&this._hint){const C=t.measureString(this._hint),g=Math.max(0,(t.viewportWidth-C.width)/2),w=(i.rows-1)*i.cellH;t.drawString(g,w,this._hint,o($n),tt(gs,e*.85))}}_drawStatusBar(e,t,i,n,s,a,o,l=kx){const c=this._renderer,h=Qx(n,l),d=String(a).padEnd(9," ");c.drawString(e,t,`${i}[`,tt(jt,o));const u=c.measureString(`${i}[`).width;c.drawString(e+u,t,h,tt(s,o));const f=c.measureString(h).width;c.drawString(e+u+f,t,`] ${d}`,tt(Wt,o))}_drawPanel(e,t){const i=this._panelSpecs.get(e);if(!i)return;const n=this._gridSize(),s=this._panelGeometry(i,n),a=this._openedAt.get(e)??this._time,o=xr((this._time-a)/Rx),l=(t?1:.82)*o,c=(1-o)*n.cellH,h=this._renderer,d=s.py+c;if(h.drawRect(s.px,d,s.wPx,s.hPx,tt(gs,l)),this._drawPanelFrame(s,d,i.title,l,t),i.draw)try{i.draw(this,{...s,py:d},l)}catch(u){console.error(`[UIManager] panel '${e}' draw hook failed:`,u)}else this._renderPanelContent(e,s,d,l,t)}_drawPanelFrame(e,t,i,n,s){const a=this._renderer,o=this._gridSize(),l=String.fromCodePoint(Xc),c=String.fromCodePoint(qc),h=tt(Wx,n),d=tt(s?$n:jt,n),u=`[ ${i} ]`,f=Math.max(0,e.cols-4-u.length),m=l.repeat(1),y=l.repeat(f);a.drawString(e.px,t,String.fromCodePoint(Va)+m,h);const p=e.px+a.measureString(String.fromCodePoint(Va)+m).width;a.drawString(p,t,u,d);const _=p+a.measureString(u).width;a.drawString(_,t,y+String.fromCodePoint(Yc),h);for(let A=1;A<e.rows-1;A+=1){const S=t+A*o.cellH;a.drawString(e.px,S,c,h),a.drawString(e.px+(e.cols-1)*o.cellW,S,c,h)}const T=t+(e.rows-1)*o.cellH;a.drawString(e.px,T,String.fromCodePoint($c)+l.repeat(Math.max(0,e.cols-2))+String.fromCodePoint(Kc),h)}_renderPanelContent(e,t,i,n,s){switch(e){case It.INVENTORY:this._renderListPanel(t,i,n,s,e,this._readInventoryItems(),a=>`${a.glyph} ${a.name}${a.count>1?` x${a.count}`:""}`,()=>Wt,"[UP/DOWN] browse   [ACTION] use");break;case It.QUEST_LOG:this._renderListPanel(t,i,n,s,e,this._readQuestItems(),a=>`${a.title}${a.objective?` — ${a.objective}`:""}`,a=>jx[a.status]??Wt,"[UP/DOWN] browse   [ACTION] track");break;case It.SHOP:this._renderShopContent(t,i,n,s);break;case It.PAUSE:this._renderPauseContent(t,i,n);break}}_renderListPanel(e,t,i,n,s,a,o,l,c){const h=this._renderer,d=this._gridSize(),u=e.innerX*d.cellW;let f=t+e.innerY*d.cellH-e.y0*d.cellH+e.y0*d.cellH;if(f=(e.y0+2)*d.cellH+(t-e.y0*d.cellH),h.drawString(u,f,`${a.length} entr${a.length===1?"y":"ies"}`,tt(jt,i)),f+=d.cellH,a.length===0)h.drawString(u,f+d.cellH,"— nothing attuned yet —",tt(jt,i));else{const y=this._panelVisibleRows(s),p=this._scrolls.get(s)??0,_=this._cursors.get(s)??0,T=Math.floor(this._time*2)%2===0,A=e.innerCols-2;for(let S=0;S<y&&p+S<a.length;S+=1){const M=p+S,E=a[M],C=n&&M===_;let w=(C?`${String.fromCodePoint(Xa)} `:"  ")+o(E);w.length>A&&(w=`${w.slice(0,A-1)}…`);const R=C&&T?$n:l(E);h.drawString(u,f,w,tt(R,i)),f+=d.cellH}}const m=(e.y0+e.rows-3)*d.cellH+(t-e.y0*d.cellH);h.drawString(u,m,c,tt(jt,i))}_renderShopContent(e,t,i,n){const s=this._renderer,a=this._gridSize(),o=(e.x0+2)*a.cellW;let l=(e.y0+2)*a.cellH+(t-e.y0*a.cellH);const c=It.SHOP,h=yt(this._player?this._player.currency:0,0),d=this._shop&&typeof this._shop.currencyName=="string"?this._shop.currencyName:"orange scrip",u=`purse: ${h} ${d}`,f=(e.x0+e.cols-2)*a.cellW-s.measureString(u).width;s.drawString(f,l-a.cellH,u,tt(Ka,i));const m=this._readShopItems();if(!this._shop){s.drawString(o,l+a.cellH,"The cart is nowhere in sight.",tt(jt,i));return}if(m.length===0){s.drawString(o,l+a.cellH,"— the keeper sold out —",tt(jt,i));return}const y=this._panelVisibleRows(c),p=this._scrolls.get(c)??0,_=this._cursors.get(c)??0,T=Math.floor(this._time*2)%2===0,A=e.innerCols-10;l+=a.cellH;for(let M=0;M<y&&p+M<m.length;M+=1){const E=p+M,C=m[E],g=n&&E===_,w=C.price<=h;let P=`${g?`${String.fromCodePoint(Xa)} `:"  "}${C.glyph} ${C.name}`;P.length>A&&(P=`${P.slice(0,A-1)}…`);const O=g&&T?$n:Wt;s.drawString(o,l,P,tt(O,i));const B=`${C.price}c`,N=(e.x0+e.cols-3)*a.cellW-s.measureString(B).width;s.drawString(N,l,B,tt(w?Ka:Ya,i)),l+=a.cellH}const S=(e.y0+e.rows-3)*a.cellH+(t-e.y0*a.cellH);s.drawString(o,S,"[UP/DOWN] browse   [ACTION] buy",tt(jt,i))}_renderPauseContent(e,t,i){const n=this._renderer,s=this._gridSize(),a=(e.x0+2)*s.cellW;let o=(e.y0+2)*s.cellH+(t-e.y0*s.cellH);const l=[{text:"Time waits for you, custodian.",color:$n},{text:"",color:Wt},{text:"WASD / ARROWS   move",color:Wt},{text:"SHIFT           sprint (drains oranges)",color:Wt},{text:"SPACE           act / dodge",color:Wt},{text:"E               interact",color:Wt},{text:"I / Q           satchel / loom records",color:Wt},{text:"ESC             resume the hour",color:jt}];for(let c=0;c<l.length&&c<e.innerRows;c+=1)l[c].text.length>0&&n.drawString(a,o,l[c].text,tt(l[c].color,i)),o+=s.cellH}_drawDialogue(e,t){const i=this._renderer,n=Math.min(Bx,t.columns-4),s=e.choices&&e.choices.length>0?e.choices.length:1,a=Math.min(t.rows-2,4+s+2),o=Math.floor((t.columns-n)/2),l=Math.max(1,t.rows-a-1),c=o*t.cellW,h=l*t.cellH;i.drawRect(c,h,n*t.cellW,a*t.cellH,gs);const d=String.fromCodePoint(Xc),u=String.fromCodePoint(qc);i.drawString(c,h,String.fromCodePoint(Va)+d.repeat(n-2)+String.fromCodePoint(Yc),xs);for(let A=1;A<a-1;A+=1)i.drawString(c,h+A*t.cellH,u,xs),i.drawString(c+(n-1)*t.cellW,h+A*t.cellH,u,xs);i.drawString(c,h+(a-1)*t.cellH,String.fromCodePoint($c)+d.repeat(n-2)+String.fromCodePoint(Kc),xs);const f=` ${e.speaker||"Voice"} `,m=c+2*t.cellW;i.drawString(m,h,f,Kx,gs);const y=n-4,p=this._wrapText(e.visibleText||"…",y),_=h+2*t.cellH;for(let A=0;A<p.length&&A<3;A+=1)i.drawString(c+2*t.cellW,_+A*t.cellH,p[A],$x);if(e.lineCount>1){const A=`${e.lineIndex+1}/${e.lineCount}`;i.drawString(c+(n-2)*t.cellW-i.measureString(A).width,h+t.cellH,A,jt)}const T=_+3*t.cellH;if(e.choices&&e.choices.length>0)for(let A=0;A<e.choices.length&&A<a-7;A+=1){const S=e.choices[A],M=S.selected?`${String.fromCodePoint(Xa)} `:"  ",E=S.selected?$n:Wt;let C=M+S.label;C.length>y&&(C=`${C.slice(0,y-1)}…`),i.drawString(c+2*t.cellW,T+A*t.cellH,C,E)}else e.lineComplete&&Math.floor(this._time*2.5)%2===0&&i.drawString(c+(n-4)*t.cellW,T,String.fromCodePoint(zx),xs)}_drawToasts(e){const t=this._renderer,i=Vc*e.cellW;let n=2*e.cellH;for(let s=0;s<this._toasts.length;s+=1){const a=this._toasts[s],o=this._time-a.born,l=a.fadeIn+a.hold+a.fadeOut;if(o>=l)continue;let c;o<a.fadeIn?c=o/a.fadeIn:o<a.fadeIn+a.hold?c=1:c=1-(o-a.fadeIn-a.hold)/a.fadeOut,c=li(c);const h=(1-xr(li(o/a.fadeIn)))*(i+e.cellW),d=(a.lines.length+2)*e.cellH,u=e.columns*e.cellW-i-e.cellW+h;t.drawRect(u,n,i,d,tt(gs,c*.9)),t.drawRect(u,n,Math.max(2,e.cellW*.35),d,tt(a.fg,c));for(let f=0;f<a.lines.length;f+=1)t.drawString(u+e.cellW,n+(f+1)*e.cellH,a.lines[f],tt(Wt,c));n+=d+e.cellH*.5}}_drawFloating(){const e=this._renderer;for(let t=0;t<this._floating.length;t+=1){const i=this._floating[t],n=this._time-i.born,s=li(n/i.life),a=i.rise*xr(s),o=.6,l=s<o?1:1-Zx((s-o)/(1-o));if(l<=.01)continue;const c=e.measureString(i.text);e.drawString(i.worldX-c.width/2,i.worldY-a,i.text,tt(i.fg,l))}}_drawAnnouncement(e){if(this._announceQueue.length===0)return;const t=this._announceQueue[0],i=this._renderer,n=this._time-t.born;if(n>=ms)return;const s=.25,a=.5;let o;n<s?o=xr(n/s):n>ms-a?o=li((ms-n)/a):o=1;const l=Jx(li(n/ms))*e.cellH,c=`✦──  ${t.text}  ──✦`,h=i.measureString(c),d=Math.max(0,(e.columns*e.cellW-h.width)/2),u=e.rows*e.cellH*.35-l;if(i.drawString(d,u,c,tt(t.fg,o)),t.sub){const f=i.measureString(t.sub);i.drawString(Math.max(0,(e.columns*e.cellW-f.width)/2),u+e.cellH*1.2,t.sub,tt(Wt,o*.85))}}_drawTransitionOverlay(e){if(!this._worldManager||typeof this._worldManager.getTransitionStatus!="function")return;let t;try{t=this._worldManager.getTransitionStatus()}catch{return}if(!t||!t.active)return;const i=this._renderer,n=e.columns*e.cellW,s=e.rows*e.cellH;if(t.fade>.001&&i.drawRect(0,0,n,s,tt(255,li(t.fade)*.97)),t.flicker>.001){const a=li(t.flicker),o=this._time;i.drawRect(0,0,n,s,tt(3941793791,a*.08+.04*Kn(o*2.2)));const l=Math.floor(a*8);for(let h=0;h<l;h+=1){const d=Kn(o*1.7+h*13.7),u=Math.floor(d*e.rows),f=(Kn(o*2.9+h*5.1)-.5)*8,m=u*e.cellH;i.drawRect(f*e.cellW,m,n,e.cellH*.6,tt(2597847039,a*.16))}const c=Math.floor(a*12);for(let h=0;h<c;h+=1){const d=Kn(o*3.3+h*7.9),u=Kn(o*2.1+h*11.3),f=qa[Math.floor(d*qa.length)%qa.length];i.drawString(d*n,Math.floor(u*e.rows)*e.cellH,String.fromCodePoint(f),tt(4294967295,a*.5))}}}_wrapText(e,t){const i=Math.max(1,Math.floor(t)),n=String(e).split(/\s+/).filter(l=>l.length>0),s=[];let a="";const o=l=>{let c=l;for(;c.length>i;)s.push(c.slice(0,i)),c=c.slice(i);return c};for(const l of n){if(l.length>i){a&&(s.push(a),a=""),a=o(l);continue}a&&a.length+1+l.length>i?(s.push(a),a=l):a=a?`${a} ${l}`:l}return s.push(a),s.length>0?s:[""]}getMetrics(){return{time:this._time,openPanels:[...this._stack],topPanel:this.getTopPanelId(),blocking:this.hasBlockingPanel(),dialogueOpen:this.isDialogueOpen(),toasts:this._toasts.length,floating:this._floating.length,announceQueue:this._announceQueue.length,hint:this._hint,lifetime:{...this._metrics}}}destroy(){this._player=null,this._questSystem=null,this._inventory=null,this._shop=null,this._camera=null,this._worldManager=null,this._dialogueView=null,this._hint=null,this._stack.length=0,this._cursors.clear(),this._scrolls.clear(),this._openedAt.clear(),this.clearNotifications(),this._listeners.clear()}}const ty=12,iy=.15,ny=19,sy=9,Jc=1.5,ry=48,ay=.25,oy=.9,Zc=.5,Qc=.6,Zn=7,ly=5,eh=1,Wi=Zn-2,pi=1,cy=9617,hy=9619,th=43,ih=45,nh=124,uy=64,dy=88,fy=33,sh=183,ja=Z.packColor("#6dff7c"),py=Z.packColor("#ffd24a"),rh=Z.packColor("#ff5a5a"),_y=Z.packColor("#7fa9ff"),my=Z.packColor("#ff7700"),ah=Z.packColor("#ff3d2e"),gy=Z.packColor("#8affdf"),xy=Z.packColor("#d7e3ee"),ys=Z.packColor("#6d7c8c"),oh=Z.packColor("#ffe9c4"),yy=Z.packColor("#ffd24a"),lh=Z.packColor("#ff9e3d"),ch=Z.packColor("#a9b8c6"),Ai=Z.packColor("#5a6d80"),vy=Z.packColor("rgba(8, 12, 18, 0.78)"),Sy=Z.packColor("#ff5a5a"),My=Z.packColor("#ffd24a"),Ey=Z.packColor("#9ad7ff"),wy=Z.packColor("#ffffff"),hh=Z.packColor("#ffffff"),uh=Z.packColor("rgba(8, 10, 16, 0.85)"),Ty=Z.packColor("#5a6672"),Or=Math.PI*2;function Qn(r){return r<0?0:r>1?1:r}function _i(r,e){return typeof r=="number"&&Number.isFinite(r)?r:e}function Mn(r,e){const t=Qn(e),i=r>>>0,n=Math.round((i&255)*t);return(i&4294967040|n&255)>>>0}function Ja(r){const e=Math.sin(r*31.7)*Math.sin(r*17.3)+Math.sin(r*7.9);return Math.min(1,Math.abs(e)/2)}function by(r){return((r+Math.PI)%Or+Or)%Or-Math.PI}function Ay(r){const e=r>>>0,t=e>>>24&255,i=e>>>16&255,n=e>>>8&255,s=e&255,a=Math.round(.2126*t+.7152*i+.0722*n);return((a&255)<<24|(a&255)<<16|(a&255)<<8|s&255)>>>0}function Cy(r){if(typeof r!="string"||r.length===0)return"·";if(r.startsWith("Key"))return r.slice(3);if(r.startsWith("Digit"))return r.slice(5);if(r.startsWith("Numpad"))return`N${r.slice(6)}`.slice(0,4);const e={Space:"SPC",Enter:"ENT",Escape:"ESC",Tab:"TAB",ShiftLeft:"SHL",ShiftRight:"SHR",ControlLeft:"CTL",ControlRight:"CTR",AltLeft:"ALT",AltRight:"ALR",ArrowUp:"UP",ArrowDown:"DN",ArrowLeft:"LT",ArrowRight:"RT"};return e[r]!==void 0?e[r]:r.slice(0,4).toUpperCase()}class qr{constructor(e,t={}){if(!e||typeof e.drawString!="function"||typeof e.drawRect!="function"||typeof e.measureString!="function")throw new TypeError("[HUD] A Renderer with drawString/drawRect/measureString is required.");if(t===null||typeof t!="object")throw new TypeError("[HUD] options must be an object.");this._renderer=e;const i=t.barInnerCols??ty;if(!Number.isInteger(i)||i<6||i>24)throw new RangeError("[HUD] barInnerCols must be an integer in [6, 24].");this._barCells=i;const n=t.criticalEnergyFraction??iy;if(!Number.isFinite(n)||n<=0||n>=1)throw new RangeError("[HUD] criticalEnergyFraction must be in (0, 1).");this._criticalFraction=n;const s=t.radarCols??ny,a=t.radarRows??sy;if(!Number.isInteger(s)||s<9||s>40)throw new RangeError("[HUD] radarCols must be an integer in [9, 40].");if(!Number.isInteger(a)||a<5||a>20)throw new RangeError("[HUD] radarRows must be an integer in [5, 20].");this._radarCols=s,this._radarRows=a,this._radarRangeX=Number.isFinite(t.radarRangeX)&&t.radarRangeX>0?t.radarRangeX:null,this._radarRangeY=Number.isFinite(t.radarRangeY)&&t.radarRangeY>0?t.radarRangeY:null;const o=t.sweepHz??ay;if(!Number.isFinite(o)||o<=0)throw new RangeError("[HUD] sweepHz must be positive.");this._sweepHz=o;const l=t.maxRadarContacts??ry;if(!Number.isInteger(l)||l<1)throw new RangeError("[HUD] maxRadarContacts must be a positive integer.");this._maxContacts=l,this._visible=!0,this._showMinimap=t.showMinimap!==!1,this._showHotbar=t.showHotbar!==!1,this._showParty=t.showParty!==!1,this._player=null,this._worldManager=null,this._camera=null,this._radarSource=null,this._skillProvider=null,this._inputManager=null,this._staticSkills=null,this._time=0,this._wasCritical=!1,this._pendingWorldFlash=!1,this._worldFlashAt=-1/0,this._readyFlashes=new Map,this._lastRemaining=new Map,this._lastContactCount=0,this._grayCache=new Map,this._worldUnsubs=[],this._listeners=new Map,this._destroyed=!1}attachPlayer(e){return this._player=e,this}attachWorldManager(e){for(const t of this._worldUnsubs)try{t()}catch(i){console.error("[HUD] world unsubscribe failed:",i)}return this._worldUnsubs=[],this._worldManager=e,e&&typeof e.on=="function"&&this._worldUnsubs.push(e.on("worldchanged",()=>{this._pendingWorldFlash=!0})),this}attachCamera(e){return this._camera=e,this}attachRadarSource(e){return this._radarSource=e,this}attachSkillProvider(e){return this._skillProvider=e,this}setSkills(e){return this._staticSkills=Array.isArray(e)?e:null,this}attachInputManager(e){return this._inputManager=e,this}setVisible(e){return this._visible=!!e,this}setShowMinimap(e){return this._showMinimap=!!e,this}setShowHotbar(e){return this._showHotbar=!!e,this}setShowParty(e){return this._showParty=!!e,this}update(e){if(this._destroyed||!Number.isFinite(e)||e<=0)return this;this._time+=e,this._pendingWorldFlash&&(this._pendingWorldFlash=!1,this._worldFlashAt=this._time);const t=this._readEnergyFraction(),i=t<this._criticalFraction;i!==this._wasCritical&&(this._wasCritical=i,this._dispatch("energycritical",{critical:i,fraction:t}));const n=this._readSkills();for(let s=0;s<n.length;s+=1){const a=n[s];(this._lastRemaining.get(a.name)??0)>0&&a.remaining<=0&&!a.locked&&(this._readyFlashes.set(a.name,this._time),this._dispatch("skillready",{name:a.name})),this._lastRemaining.set(a.name,a.remaining)}return this}render(e=1){if(this._destroyed||!this._visible)return;const t=this._gridSize();if(t.columns<40||t.rows<14)return;const i=this._readWorldId(),n=this._readTransitionStatus();this._drawStatusBlock(t,i),this._drawDimensionBadge(t,i,n),this._showMinimap&&this._drawRadar(t,e),this._showHotbar&&this._drawHotbar(t)}_gridSize(){const e=this._renderer,t=e.cellWidth>0?e.cellWidth:9.6,i=e.cellHeight>0?e.cellHeight:20;let n,s;if(typeof e.getViewportGridSize=="function"){const a=e.getViewportGridSize();n=a.columns,s=a.rows}else n=Math.max(1,Math.ceil(e.viewportWidth/t)),s=Math.max(1,Math.ceil(e.viewportHeight/i));return{columns:n,rows:s,cellW:t,cellH:i}}_presentColor(e,t=!1){if(t||this._readWorldId()!=="DRAB")return e;const i=e>>>0,n=this._grayCache.get(i);if(n!==void 0)return n;const s=Ay(i);return this._grayCache.size>1024&&this._grayCache.clear(),this._grayCache.set(i,s),s}static buildBar(e,t,i="█",n="░"){const s=Math.max(1,Math.floor(t)),a=Math.round(Qn(e)*s);return i.repeat(a)+n.repeat(s-a)}_drawStatusBar(e,t,i,n,s,a,o=!1){const l=this._renderer,c=qr.buildBar(n,this._barCells),h=`${String(Math.round(Qn(n)*100)).padStart(3," ")}%`,d=String(a).padEnd(9," ");l.drawString(e,t,`${i}[`,this._presentColor(ys,o));const u=l.measureString(`${i}[`).width;l.drawString(e+u,t,c,this._presentColor(s,o));const f=l.measureString(c).width;l.drawString(e+u+f,t,`] ${d}${h}`,this._presentColor(xy,o))}_drawStatusBlock(e,t){const i=this._renderer,n=pi*e.cellW,s=this._player,a=6+this._barCells+16;if(i.drawRect(n-e.cellW*.5,pi*e.cellH-e.cellH*.25,a*e.cellW,(s?8:2)*e.cellH,this._presentColor(uh)),!s){i.drawString(n,pi*e.cellH,"NO THREAD ATTUNED",this._presentColor(ys));return}let o=pi;const l=M=>M*e.cellH,c=typeof s.name=="string"?s.name:"Custodian",h=_i(s.level,1);i.drawString(n,l(o),`${c}  Lv.${h}`,this._presentColor(oh)),o+=1;const d=_i(s.hp,0),u=_i(s.maxHp,0),f=u>0?d/u:0,m=f>.5?ja:f>.25?py:rh;this._drawStatusBar(n,l(o),"HP    ",f,m,`${Math.ceil(d)}/${Math.ceil(u)}`),o+=1,Number.isFinite(s.mp)&&Number.isFinite(s.maxMp)&&s.maxMp>0&&(this._drawStatusBar(n,l(o),"MP    ",s.mp/s.maxMp,_y,`${Math.ceil(s.mp)}/${Math.ceil(s.maxMp)}`),o+=1);const y=this._readEnergyFraction();let p=my,_=1;y<this._criticalFraction&&(p=ah,_=.45+.55*Ja(this._time*1.8));const T=_i(s.oranges,0),A=_i(s.maxOranges,20),S=Mn(this._presentColor(p,!0),_);if(this._drawStatusBar(n,l(o),"ORANGE",y,S,`${Math.ceil(T)}/${Math.ceil(A)}`,!0),o+=1,Number.isFinite(s.currency)){const M=typeof s.currencyName=="string"?s.currencyName:"scrip";i.drawString(n,l(o),`${M}: ${Math.floor(s.currency)}  [${t}]`,this._presentColor(yy)),o+=1}if(this._showParty&&Array.isArray(s.party)&&s.party.length>0){o+=1;for(let M=0;M<s.party.length&&o<e.rows-2;M+=1){const E=s.party[M];if(!E||typeof E.name!="string")continue;const C=_i(E.maxHp,0),g=C>0?_i(E.hp,0)/C:0;this._drawStatusBar(n,l(o),E.name.slice(0,10).padEnd(10," "),g,g>.25?ja:rh,`${Math.round(g*100)}%`),o+=1}}}_drawDimensionBadge(e,t,i){const n=this._renderer,s=pi*e.cellH;let a,o;i.active&&i.to?(a=`SHIFT → ${i.to} ${Math.round(i.progress*100)}%`,o=i.to==="DRAB"?ch:lh):t==="DRAB"?(a="DRAB WORLD",o=ch):(a="DREAM WORLD",o=lh);const l=`[ ${a} ]`,c=n.measureString(l),h=e.columns*e.cellW-c.width-pi*e.cellW;let d=1;const u=this._wasCritical;if(u&&t==="DREAM"&&!i.active?d=.55+.45*Ja(this._time*2.1):i.active&&i.flicker>.01&&(d=.6+.4*Ja(this._time*3.3)),n.drawRect(h-e.cellW*.5,s-e.cellH*.25,c.width+e.cellW,c.height+e.cellH*.5,this._presentColor(uh,!0)),n.drawString(h,s,l,Mn(this._presentColor(o,!0),d)),u&&t==="DREAM"&&!i.active){const m=Mn(ah,d);n.drawString(h-e.cellW,s,"<",m),n.drawString(h+c.width,s,">",m)}const f=this._time-this._worldFlashAt;if(f>=0&&f<Qc){const m=1-f/Qc;n.drawString(h,s,l,Mn(hh,m*m))}if(i.active){const p=`(${qr.buildBar(i.progress,10)})`,_=n.measureString(p);n.drawString(e.columns*e.cellW-_.width-pi*e.cellW,s+e.cellH,p,Mn(this._presentColor(o,!0),d))}}_drawRadar(e,t){const i=this._renderer,n=this._radarCols,s=this._radarRows,a=pi,o=e.rows-s-pi-1,l=a*e.cellW,c=o*e.cellH;i.drawRect(l,c,n*e.cellW,s*e.cellH,this._presentColor(vy));const h=String.fromCodePoint(ih),d=String.fromCodePoint(nh),u=String.fromCodePoint(th);let f=u+h.repeat(n-2)+u;const m=Math.floor(f.length/2);f=`${f.slice(0,m)}N${f.slice(m+1)}`,i.drawString(l,c,f,this._presentColor(Ai));for(let g=1;g<s-1;g+=1)i.drawString(l,c+g*e.cellH,d,this._presentColor(Ai)),i.drawString(l+(n-1)*e.cellW,c+g*e.cellH,d,this._presentColor(Ai));i.drawString(l,c+(s-1)*e.cellH,u+h.repeat(n-2)+u,this._presentColor(Ai));const y=this._radarCenter(t);if(!y){i.drawString(l+e.cellW,c+Math.floor(s/2)*e.cellH,"NO SIGNAL",this._presentColor(ys)),this._lastContactCount=0;return}const p=this._camera,_=this._radarRangeX??(p?p.viewportWidth*Jc:900),T=this._radarRangeY??(p?p.viewportHeight*Jc:600);if(p){const g=p.viewportWidth/2,w=p.viewportHeight/2,R=[[y.x-g,y.y-w],[y.x+g,y.y-w],[y.x-g,y.y+w],[y.x+g,y.y+w]];for(const[P,O]of R){const B=this._projectToRadar(P,O,y,_,T,n,s);B&&i.drawString(l+B.col*e.cellW,c+B.row*e.cellH,String.fromCodePoint(sh),this._presentColor(ys))}}const A=Or*(this._time*this._sweepHz%1),S=this._readRadarContacts();let M=0;for(let g=0;g<S.length&&M<this._maxContacts;g+=1){const w=S[g],R=this._projectToRadar(w.x,w.y,y,_,T,n,s);if(!R)continue;const P=Math.atan2(w.y-y.y,w.x-y.x),O=Math.abs(by(P-A)),N=.35+.65*Math.max(0,1-O/oy),H=w.color??(w.kind==="hostile"?Sy:w.kind==="quest"?My:Ey),J=w.glyph??(w.kind==="hostile"?dy:w.kind==="quest"?fy:sh);i.drawString(l+R.col*e.cellW,c+R.row*e.cellH,String.fromCodePoint(J),Mn(this._presentColor(H,w.kind==="quest"),N)),M+=1}this._lastContactCount=M;const E=Math.floor(n/2),C=Math.floor(s/2);i.drawString(l+E*e.cellW,c+C*e.cellH,String.fromCodePoint(uy),this._presentColor(wy,!0))}_radarCenter(e){const t=this._camera;if(t&&Number.isFinite(t.x)&&Number.isFinite(t.y)&&Number.isFinite(t.viewportWidth)&&Number.isFinite(t.viewportHeight))return{x:t.x+t.viewportWidth/2,y:t.y+t.viewportHeight/2};const i=this._player;if(i){if(typeof i.getRenderPosition=="function")return i.getRenderPosition(e);if(Number.isFinite(i.x)&&Number.isFinite(i.y))return{x:i.x,y:i.y}}return null}_projectToRadar(e,t,i,n,s,a,o){if(!Number.isFinite(e)||!Number.isFinite(t))return null;const l=(e-i.x)/n,c=(t-i.y)/s,h=Math.max(-1,Math.min(1,l)),d=Math.max(-1,Math.min(1,c)),u=Math.max(1,Math.min(a-2,Math.round((h+1)/2*(a-1)))),f=Math.max(1,Math.min(o-2,Math.round((d+1)/2*(o-1))));return{col:u,row:f,clamped:l!==h||c!==d}}_drawHotbar(e){const t=this._renderer,i=this._readSkills();if(i.length===0)return;const n=i.length*Zn+(i.length-1)*eh,s=Math.max(pi,Math.floor((e.columns-n)/2)),o=(e.rows-ly-pi)*e.cellH,l=String.fromCodePoint(ih),c=String.fromCodePoint(nh),h=String.fromCodePoint(th),d=h+l.repeat(Wi)+h,u=h+l.repeat(Wi)+h;for(let f=0;f<i.length;f+=1){const m=i[f],y=(s+f*(Zn+eh))*e.cellW,p=m.remaining>0&&m.duration>0,_=p?Qn(1-m.remaining/m.duration):1,T=`[${m.key}]`,A=t.measureString(T);t.drawString(y+(Zn*e.cellW-A.width)/2,o,T,this._presentColor(ys)),t.drawString(y,o+e.cellH,d,this._presentColor(Ai)),t.drawString(y,o+4*e.cellH,u,this._presentColor(Ai));const S=o+2*e.cellH;let M=1,E=oh;m.locked?(M=.4,E=Ty):p&&(M=.35);const C=this._time-(this._readyFlashes.get(m.name)??-1/0);if(C>=0&&C<Zc){const H=1-C/Zc;E=hh,M=.5+.5*H*H}t.drawString(y,S,c,this._presentColor(Ai));const g=m.locked?"LOCK".padStart(Wi," ").slice(0,Wi):`  ${m.glyph}  `.slice(0,Wi).padEnd(Wi," ");t.drawString(y+e.cellW,S,g,Mn(this._presentColor(E),M)),t.drawString(y+(Zn-1)*e.cellW,S,c,this._presentColor(Ai));const w=o+3*e.cellH,R=Math.round(_*Wi),P=String.fromCodePoint(hy).repeat(R),O=String.fromCodePoint(cy).repeat(Wi-R),B=m.locked?" -- ":p?` ${m.remaining>=9.95?Math.ceil(m.remaining):m.remaining.toFixed(1)}s`:"RDY ",N=`${P}${O}`.slice(0,Wi-4)+B.slice(0,4);t.drawString(y,w,c,this._presentColor(Ai)),t.drawString(y+e.cellW,w,N,this._presentColor(p?gy:ja)),t.drawString(y+(Zn-1)*e.cellW,w,c,this._presentColor(Ai))}}_readEnergyFraction(){const e=this._player;if(!e)return 1;if(Number.isFinite(e.energyFraction))return Qn(e.energyFraction);const t=_i(e.oranges,0),i=_i(e.maxOranges,0);return i>0?Qn(t/i):0}_readWorldId(){if(this._worldManager&&typeof this._worldManager.getActiveWorldId=="function")try{return String(this._worldManager.getActiveWorldId())}catch{}return"DREAM"}_readTransitionStatus(){if(this._worldManager&&typeof this._worldManager.getTransitionStatus=="function")try{return this._worldManager.getTransitionStatus()}catch{}return{active:!1,to:null,progress:0,flicker:0,fade:0}}_readRadarContacts(){const e=this._radarSource;if(!e)return[];let t=[];try{typeof e.getRadarContacts=="function"?t=e.getRadarContacts():Array.isArray(e.entities)?t=e.entities:Array.isArray(e)&&(t=e)}catch(n){return console.error("[HUD] radar source read failed:",n),[]}if(!Array.isArray(t))return[];const i=[];for(let n=0;n<t.length&&i.length<this._maxContacts;n+=1){const s=t[n];if(!s||typeof s!="object")continue;const a=Number.isFinite(s.centerX)?s.centerX:Number.isFinite(s.x)?s.x:NaN,o=Number.isFinite(s.centerY)?s.centerY:Number.isFinite(s.y)?s.y:NaN;if(!Number.isFinite(a)||!Number.isFinite(o))continue;let l="neutral";typeof s.kind=="string"?l=s.kind==="hostile"||s.kind==="quest"?s.kind:"neutral":typeof s.hasTag=="function"&&(s.hasTag("hostile")?l="hostile":(s.hasTag("quest-marker")||s.hasTag("quest"))&&(l="quest")),i.push({x:a,y:o,kind:l,glyph:typeof s.glyph=="number"?s.glyph:null,color:typeof s.color=="number"?s.color:null})}return i}_readSkills(){let e=null;const t=this._skillProvider;try{t&&typeof t.getSkills=="function"?e=t.getSkills():t&&Array.isArray(t.skills)?e=t.skills:this._staticSkills&&(e=this._staticSkills)}catch(n){return console.error("[HUD] skill provider read failed:",n),[]}if(!Array.isArray(e))return[];const i=[];for(let n=0;n<e.length;n+=1){const s=e[n];if(!s||typeof s!="object")continue;let a=typeof s.key=="string"?s.key:null;if(!a&&s.action&&this._inputManager&&typeof this._inputManager.getBoundCodes=="function"){const l=this._inputManager.getBoundCodes(s.action);l.length>0&&(a=Cy(l[0]))}a||(a=String(n+1));const o=typeof s.glyph=="string"&&s.glyph.length>0?s.glyph:"?";i.push({name:typeof s.name=="string"?s.name:`skill-${n}`,glyph:Array.from(o)[0],key:a,remaining:Math.max(0,_i(s.cooldownRemaining??s.remaining,0)),duration:Math.max(0,_i(s.cooldownDuration??s.duration,0)),locked:!!s.locked})}return i}addEventListener(e,t){if(typeof e!="string"||e.length===0)throw new TypeError("[HUD] event type must be a string.");if(typeof t!="function")throw new TypeError("[HUD] listener must be a function.");let i=this._listeners.get(e);return i||(i=new Set,this._listeners.set(e,i)),i.add(t),()=>this.removeEventListener(e,t)}removeEventListener(e,t){const i=this._listeners.get(e);return i&&(i.delete(t),i.size===0&&this._listeners.delete(e)),this}_dispatch(e,t){const i=this._listeners.get(e);if(i)for(const n of i)try{n(t)}catch(s){console.error(`[HUD] '${e}' listener failed:`,s)}}getMetrics(){return{time:this._time,world:this._readWorldId(),energyFraction:this._readEnergyFraction(),critical:this._wasCritical,radarContacts:this._lastContactCount,skills:this._readSkills().length,visible:this._visible,showMinimap:this._showMinimap,showHotbar:this._showHotbar}}destroy(){if(!this._destroyed){this._destroyed=!0;for(const e of this._worldUnsubs)try{e()}catch(t){console.error("[HUD] world unsubscribe failed:",t)}this._worldUnsubs=[],this._player=null,this._worldManager=null,this._camera=null,this._radarSource=null,this._skillProvider=null,this._inputManager=null,this._staticSkills=null,this._readyFlashes.clear(),this._lastRemaining.clear(),this._grayCache.clear(),this._listeners.clear()}}}const gt=Object.freeze({IDLE:"IDLE",TYPING:"TYPING",AWAITING_INPUT:"AWAITING_INPUT",CLOSED:"CLOSED"}),Ci=Object.freeze({NPC:"NPC",PLAYER:"PLAYER",SYSTEM:"SYSTEM"}),En=Object.freeze({CONTINUE:"CONTINUE",CHOICES:"CHOICES"}),Ry=45,Py=3,Iy=76,Dy=5,Ly=4,Ny=43,Fy=45,dh=124,Oy=62,Uy=9660,Za=Z.packColor("rgba(8, 10, 16, 0.92)"),ai=Z.packColor("#6d7c8c"),ky=Z.packColor("#f4ecdc"),By=Z.packColor("#8a97a6"),Hy=Z.packColor("#ff9e3d"),Gy=Z.packColor("#7fd4ff"),zy=Z.packColor("#d7e3ee"),Wy=Z.packColor("#ffb057"),Vy=Z.packColor("#9ad7ff"),Xy=Z.packColor("#c2cdd8"),qy=Z.packColor("#d7e3ee"),Yy=Z.packColor("#ffe9c4"),$y=Z.packColor("rgba(255, 158, 61, 0.10)"),Ky=Z.packColor("rgba(255, 158, 61, 0.20)"),jy=Z.packColor("#ffd27f"),Jy=Z.packColor("#8a97a6"),Zy=.6,fh=.78,Qy=2.4;function ev(r,e){const t=e<0?0:e>1?1:e,i=r>>>0,n=Math.round((i&255)*t);return(i&4294967040|n&255)>>>0}function tv(r,e){const t=Math.max(1,Math.floor(e)),i=String(r).split(/\s+/).filter(o=>o.length>0),n=[];let s="";const a=o=>{let l=o;for(;l.length>t;)n.push(l.slice(0,t)),l=l.slice(t);return l};for(const o of i){if(o.length>t){s&&(n.push(s),s=""),s=a(o);continue}s&&s.length+1+o.length>t?(n.push(s),s=o):s=s?`${s} ${o}`:o}return n.push(s),n.length>0?n:[""]}function ph(r,e){return r.x>=e.x&&r.x<e.x+e.w&&r.y>=e.y&&r.y<e.y+e.h}class _h{constructor(e,t={}){if(!e||typeof e.drawString!="function"||typeof e.drawRect!="function"||typeof e.measureString!="function")throw new TypeError("[DialogueBox] A Renderer with drawString/drawRect/measureString is required.");if(t===null||typeof t!="object")throw new TypeError("[DialogueBox] options must be an object.");this._renderer=e,this.setTypingSpeed(t.charsPerSecond??Ry);const i=t.fastForwardMultiplier??Py;if(!Number.isFinite(i)||i<1)throw new RangeError("[DialogueBox] fastForwardMultiplier must be >= 1.");this._fastForwardMultiplier=i;const n=t.maxCols??Iy;if(!Number.isInteger(n)||n<30)throw new RangeError("[DialogueBox] maxCols must be an integer >= 30.");this._maxCols=n;const s=t.portraitWidth??Dy;if(!Number.isInteger(s)||s<3)throw new RangeError("[DialogueBox] portraitWidth must be an integer >= 3.");this._portraitWidth=s;const a=t.textRows??Ly;if(!Number.isInteger(a)||a<1||a>8)throw new RangeError("[DialogueBox] textRows must be an integer in [1, 8].");this._textRows=a,this._tickEvery=Math.max(1,Math.floor(t.tickEvery??1)),this._audioSkipWhitespace=t.audioSkipWhitespace!==!1,this._playerName=typeof t.playerName=="string"?t.playerName:null,this._state=gt.IDLE,this._awaitMode=En.CONTINUE,this._mode="driven",this._time=0,this._fingerprint="",this._speaker="Voice",this._speakerGlyph="N",this._speakerKind=Ci.NPC,this._wrappedLines=[""],this._flatText="",this._lineOffsets=[0],this._revealed=0,this._accumulator=0,this._lineIndex=0,this._lineCount=1,this._choices=[],this._selection=0,this._hoverIndex=-1,this._awaitingOwner=!1,this._scriptLines=[],this._scriptOnComplete=null,this._layout=null,this._listeners=new Map,this._destroyed=!1;const o=[["onStart","started"],["onCharTyped","chartyped"],["onLineComplete","linecomplete"],["onOptionSelected","optionselected"],["onComplete","complete"],["onClose","closed"],["onStateChange","statechange"]];for(const[l,c]of o)if(t[l]!==void 0){if(typeof t[l]!="function")throw new TypeError(`[DialogueBox] ${l} must be a function.`);this.addEventListener(c,t[l])}}setTypingSpeed(e){if(!Number.isFinite(e)||e<=0)throw new RangeError("[DialogueBox] charsPerSecond must be positive.");return this._charsPerSecond=e,this}get charsPerSecond(){return this._charsPerSecond}setPlayerName(e){return this._playerName=typeof e=="string"&&e.length>0?e:null,this}present(e){if(this._destroyed)return!1;if(!e||e.active===!1)return this.close("view-inactive"),!1;this._mode="driven";const t=typeof e.nodeId=="string"?e.nodeId:e.speaker??"node",i=Number.isFinite(e.lineIndex)?e.lineIndex:0,n=`${t}:${i}`;if(this._speaker=typeof e.speaker=="string"&&e.speaker.length>0?e.speaker:"Voice",this._speakerGlyph=typeof e.speakerGlyph=="string"&&e.speakerGlyph.length>0?Array.from(e.speakerGlyph)[0]:"N",this._speakerKind=this._classifySpeaker(e),n!==this._fingerprint){const s=typeof e.fullLine=="string"&&e.fullLine.length>0?e.fullLine:typeof e.visibleText=="string"?e.visibleText:"";this._fingerprint=n,this._lineIndex=i,this._lineCount=Number.isFinite(e.lineCount)?Math.max(1,e.lineCount):1,this._adoptText(s),this._adoptChoices(e.choices??[]),this._awaitingOwner=!1,this._setState(gt.TYPING),this._dispatch("started",{speaker:this._speaker,kind:this._speakerKind,lineIndex:this._lineIndex,lineCount:this._lineCount})}else this._mirrorChoices(e.choices??[]);return!0}presentLines(e,t,i={}){if(this._destroyed)return!1;if(typeof e!="string"||e.length===0)throw new TypeError("[DialogueBox] speaker must be a non-empty string.");if(!Array.isArray(t)||t.length===0||!t.every(n=>typeof n=="string"&&n.length>0))throw new TypeError("[DialogueBox] lines must be a non-empty string array.");return this._mode="script",this._scriptLines=t.map((n,s)=>({speaker:e,glyph:typeof i.glyph=="string"&&i.glyph.length>0?Array.from(i.glyph)[0]:"◈",kind:Object.values(Ci).includes(i.kind)?i.kind:Ci.SYSTEM,text:n})),this._lineCount=t.length,this._lineIndex=0,this._presentScriptLine(),!0}_presentScriptLine(){const e=this._scriptLines[this._lineIndex];this._speaker=e.speaker,this._speakerGlyph=e.glyph,this._speakerKind=e.kind,this._fingerprint=`script:${this._lineIndex}`,this._adoptText(e.text),this._adoptChoices([]),this._awaitingOwner=!1,this._setState(gt.TYPING),this._dispatch("started",{speaker:this._speaker,kind:this._speakerKind,lineIndex:this._lineIndex,lineCount:this._lineCount})}_classifySpeaker(e){return Object.values(Ci).includes(e.speakerKind)?e.speakerKind:this._playerName!==null&&e.speaker===this._playerName?Ci.PLAYER:Ci.NPC}_adoptText(e){const t=this._gridSize(),i=Math.min(this._maxCols,t.columns-4),n=Math.max(8,i-this._portraitWidth-6),s=tv(e,n);if(s.length>this._textRows){const o=s.slice(0,this._textRows),l=o[this._textRows-1];o[this._textRows-1]=l.length>1?`${l.slice(0,l.length-1)}…`:"…",this._wrappedLines=o}else this._wrappedLines=s;this._flatText=this._wrappedLines.join(""),this._lineOffsets=[];let a=0;for(const o of this._wrappedLines)this._lineOffsets.push(a),a+=o.length;this._revealed=0,this._accumulator=0}_adoptChoices(e){this._choices=Array.isArray(e)?e.filter(i=>i&&typeof i.label=="string").map(i=>({label:i.label})):[];const t=Array.isArray(e)?e.findIndex(i=>i&&i.selected===!0):-1;this._selection=t>=0?t:0,this._hoverIndex=-1}_mirrorChoices(e){if(!Array.isArray(e)||this._awaitingOwner||e.length!==this._choices.length)return;const t=e.findIndex(i=>i&&i.selected===!0);t>=0&&t!==this._selection&&(this._selection=t)}_advanceTypewriter(e,t){const i=this._flatText.length;if(this._revealed>=i){this._completeLine(!1);return}const n=t?this._fastForwardMultiplier:1;this._accumulator+=this._charsPerSecond*e*n;const s=Math.min(i,Math.floor(this._accumulator));s>this._revealed&&this._revealThrough(s),this._revealed>=i&&this._completeLine(!1)}_revealThrough(e){const t=this._flatText.length;for(;this._revealed<e&&this._revealed<t;){const i=this._flatText[this._revealed],n=i===" "||i==="	";!(this._audioSkipWhitespace&&n)&&this._revealed%this._tickEvery===0&&this._dispatch("chartyped",{char:i,index:this._revealed,total:t,speaker:this._speaker}),this._revealed+=1}}skipLine(){if(this._state!==gt.TYPING)return!1;const e=this._flatText.length;return this._revealed=e,this._accumulator=e,this._completeLine(!0),!0}_completeLine(e){this._state===gt.TYPING&&(this._awaitMode=this._choices.length>0?En.CHOICES:En.CONTINUE,this._setState(gt.AWAITING_INPUT),this._dispatch("linecomplete",{skipped:e,lineIndex:this._lineIndex,lineCount:this._lineCount,hasChoices:this._choices.length>0}))}get isAwaitingChoice(){return this._state===gt.AWAITING_INPUT&&this._awaitMode===En.CHOICES}getSelection(){return this._selection}moveSelection(e){if(!this.isAwaitingChoice||this._choices.length===0)return this;const t=e<0?-1:1,i=this._choices.length;return this.setSelection((this._selection+t+i)%i),this}setSelection(e){if(!this.isAwaitingChoice||this._choices.length===0)return this;const t=Math.max(0,Math.min(this._choices.length-1,Math.floor(e)));return t===this._selection?this:(this._selection=t,this._dispatch("selection",{index:t,label:this._choices[t].label}),this)}_confirmChoice(){if(!this.isAwaitingChoice||this._awaitingOwner)return!1;const e=this._choices[this._selection];return e?(this._awaitingOwner=!0,this._dispatch("optionselected",{index:this._selection,label:e.label,speaker:this._speaker}),!0):!1}static syncChoiceCursor(e,t){if(!e||typeof e.getDialogueView!="function"||typeof e.moveChoiceSelection!="function")return!1;const i=e.getDialogueView();if(!i.active||!Array.isArray(i.choices)||i.choices.length===0)return!1;const n=i.choices.findIndex(c=>c&&c.selected===!0),s=n>=0?n:0;let o=Math.max(0,Math.min(i.choices.length-1,Math.floor(t)))-s;const l=o<0?-1:1;o=Math.abs(o);for(let c=0;c<o;c+=1)e.moveChoiceSelection(l);return!0}handleInput(e){if(this._destroyed||!e||this._state!==gt.TYPING&&this._state!==gt.AWAITING_INPUT)return!1;let t=!1;const i=typeof e.getMousePosition=="function"?e.getMousePosition():null;if(i&&this.isAwaitingChoice&&this._layout){this._hoverIndex=-1;for(const s of this._layout.choiceRects)if(ph(i,s)){this._hoverIndex=s.index,this.setSelection(s.index);break}}const n=s=>typeof e.isActionJustPressed=="function"&&e.isActionJustPressed(s);if(n("PAUSE"))return this._dispatch("abort",{reason:"user-exit"}),this.close("abort"),!0;if(this.isAwaitingChoice){if(n("MOVE_UP"))return this.moveSelection(-1),!0;if(n("MOVE_DOWN"))return this.moveSelection(1),!0}return n("ACTION")&&(t=this._handleConfirm()||t),typeof e.isMouseJustPressed=="function"&&e.isMouseJustPressed(bs.LEFT)&&i&&this._layout&&ph(i,this._layout.boxRect)&&(t=this._handleConfirm()||t),t}_handleConfirm(){return this._state===gt.TYPING?this.skipLine():this._state!==gt.AWAITING_INPUT||this._awaitingOwner?!1:this._awaitMode===En.CHOICES?this._confirmChoice():(this._awaitingOwner=!0,this._mode==="script"?this._advanceScript():this._dispatch("advance",{lineIndex:this._lineIndex,lineCount:this._lineCount}),!0)}_advanceScript(){this._lineIndex+1<this._scriptLines.length?(this._lineIndex+=1,this._presentScriptLine()):(this.close("complete"),this._dispatch("complete",{lines:this._scriptLines.length}))}get state(){return this._state}get isOpen(){return this._state===gt.TYPING||this._state===gt.AWAITING_INPUT}_setState(e){if(e===this._state)return;const t=this._state;this._state=e,this._dispatch("statechange",{from:t,to:e})}close(e="closed"){return this.isOpen?(this._setState(gt.CLOSED),this._choices=[],this._wrappedLines=[""],this._flatText="",this._layout=null,this._dispatch("closed",{reason:e}),!0):(this._setState(gt.CLOSED),!1)}reset(){return this._setState(gt.IDLE),this._fingerprint="",this._awaitingOwner=!1,this}update(e,t=null){if(this._destroyed||!Number.isFinite(e)||e<=0)return this;if(this._time+=e,this._state===gt.TYPING){const i=!!(t&&typeof t.isActionDown=="function"&&t.isActionDown("SPRINT"));this._advanceTypewriter(e,i)}return this}_gridSize(){const e=this._renderer,t=e.cellWidth>0?e.cellWidth:9.6,i=e.cellHeight>0?e.cellHeight:20;let n,s;if(typeof e.getViewportGridSize=="function"){const a=e.getViewportGridSize();n=a.columns,s=a.rows}else n=Math.max(1,Math.ceil(e.viewportWidth/t)),s=Math.max(1,Math.ceil(e.viewportHeight/i));return{columns:n,rows:s,cellW:t,cellH:i}}_composeLayout(e){const t=Math.min(this._maxCols,e.columns-4),i=this._awaitMode===En.CHOICES&&this._state===gt.AWAITING_INPUT?this._choices.length:0,n=Math.max(1,Math.min(this._textRows,this._wrappedLines.length||1)),s=1+n+(i>0?i+2:1)+1,a=Math.floor((e.columns-t)/2),o=Math.max(1,e.rows-s-1),l=a*e.cellW,c=o*e.cellH,h={cols:t,rows:s,px:l,py:c,wPx:t*e.cellW,hPx:s*e.cellH,textX:a+this._portraitWidth+4,textCols:Math.max(8,t-this._portraitWidth-6),textTopRow:o+1,choiceRects:[],boxRect:{x:l,y:c,w:t*e.cellW,h:s*e.cellH}};if(i>0){const u=o+1+n+1;for(let f=0;f<i;f+=1)h.choiceRects.push({index:f,x:(a+1)*e.cellW,y:(u+f)*e.cellH,w:(t-2)*e.cellW,h:e.cellH})}return h}render(e=1){if(this._destroyed||!this.isOpen)return;const t=this._gridSize();if(t.columns<24||t.rows<8)return;const i=this._composeLayout(t);this._layout=i;const n=this._renderer,s=String.fromCodePoint(Fy),a=String.fromCodePoint(dh),o=String.fromCodePoint(Ny),l=t.cellW,c=t.cellH;n.drawRect(i.px,i.py,i.wPx,i.hPx,Za);const h=this._speakerKind===Ci.PLAYER?Gy:this._speakerKind===Ci.SYSTEM?zy:Hy,d=`${o}--[ `,f=Math.max(1,i.cols-d.length-3-1);let m=this._speaker;m.length>f&&(m=`${m.slice(0,f-1)}…`);const y=Math.max(1,i.cols-d.length-m.length-2);if(n.drawString(i.px,i.py,d,ai),n.drawString(i.px+n.measureString(d).width,i.py,m,h),n.drawString(i.px+n.measureString(d+m).width,i.py,` ]${s.repeat(y)}${o}`,ai),this._lineCount>1){const E=`${this._lineIndex+1}/${this._lineCount}`,C=i.px+(i.cols-1-E.length)*l;n.drawString(C,i.py+c*0,E,Jy,Za)}const p=Math.min(this._textRows,this._wrappedLines.length||1),_=i.textTopRow+Math.floor(p/2),T=this._speakerKind===Ci.PLAYER?Vy:this._speakerKind===Ci.SYSTEM?Xy:Wy,A=this._state===gt.TYPING?fh+(1-fh)*(.5+.5*Math.sin(Math.PI*2*Zy*this._time)):1;for(let E=0;E<p;E+=1){const C=i.textTopRow+E,g=C*c;if(n.drawString(i.px,g,a,ai),C===_){const P=i.px+2*l;n.drawString(P,g,this._speakerGlyph,ev(T,A),Za)}const w=i.px+(this._portraitWidth+2)*l;n.drawString(w,g,a,ai);const R=this._visibleRowText(E);R.length>0&&n.drawString(i.textX*l,g,R,ky),n.drawString(i.px+(i.cols-1)*l,g,a,ai)}let S=i.textTopRow+p;if(this._awaitMode===En.CHOICES&&this._state===gt.AWAITING_INPUT){n.drawString(i.px,S*c,o+s.repeat(i.cols-2)+o,ai),S+=1;for(let E=0;E<this._choices.length;E+=1){const C=S*c,g=E===this._selection,w=E===this._hoverIndex;let P=(g?`${String.fromCodePoint(Oy)} `:"  ")+this._choices[E].label;const O=i.cols-4;P.length>O&&(P=`${P.slice(0,O-1)}…`);const B=w&&!g?Ky:g?$y:null,N=g?Yy:qy;n.drawString(i.px+2*l,C,P,N,B),n.drawString(i.px,C,a,ai),n.drawString(i.px+(i.cols-1)*l,C,a,ai),S+=1}this._drawHintRow(S,i,l,c,"[W/S] choose  [SPACE] confirm  [ESC] end")}else this._state===gt.AWAITING_INPUT&&Math.floor(this._time*Qy)%2===0&&n.drawString(i.px+(i.cols-3)*l,(i.textTopRow+p-1)*c,String.fromCodePoint(Uy),jy),this._drawHintRow(S,i,l,c,this._state===gt.TYPING?"[SPACE] skip":"[SPACE] continue");n.drawString(i.px,(i.rows+i.textTopRow-i.textTopRow+(this._layout.rows-1)-(this._layout.rows-1))*c+(t.rows-i.rows-1>=0,0),"",ai);const M=this._layout.rows-1;n.drawString(i.px,(Math.floor(i.py/c)+M)*c,o+s.repeat(i.cols-2)+o,ai)}_visibleRowText(e){if(e<0||e>=this._wrappedLines.length)return"";const t=this._lineOffsets[e],i=this._wrappedLines[e];if(this._revealed<=t)return"";const n=Math.min(i.length,this._revealed-t);return i.slice(0,n)}_drawHintRow(e,t,i,n,s){const a=String.fromCodePoint(dh),o=t.cols-4,l=s.length>o?s.slice(0,o):s;this._renderer.drawString(t.px,e*n,a,ai),this._renderer.drawString(t.px+2*i,e*n,l,By),this._renderer.drawString(t.px+(t.cols-1)*i,e*n,a,ai)}addEventListener(e,t){if(typeof e!="string"||e.length===0)throw new TypeError("[DialogueBox] event type must be a string.");if(typeof t!="function")throw new TypeError("[DialogueBox] listener must be a function.");let i=this._listeners.get(e);return i||(i=new Set,this._listeners.set(e,i)),i.add(t),()=>this.removeEventListener(e,t)}removeEventListener(e,t){const i=this._listeners.get(e);return i&&(i.delete(t),i.size===0&&this._listeners.delete(e)),this}_dispatch(e,t){const i=this._listeners.get(e);if(i)for(const n of i)try{n(t)}catch(s){console.error(`[DialogueBox] '${e}' listener failed:`,s)}}getMetrics(){return{state:this._state,awaitMode:this._awaitMode,mode:this._mode,speaker:this._speaker,speakerKind:this._speakerKind,lineIndex:this._lineIndex,lineCount:this._lineCount,revealedChars:this._revealed,totalChars:this._flatText.length,charsPerSecond:this._charsPerSecond,choices:this._choices.length,selection:this._selection,hoverIndex:this._hoverIndex,time:this._time}}destroy(){this._destroyed||(this._destroyed=!0,this._setState(gt.CLOSED),this._listeners.clear(),this._layout=null,this._choices=[],this._scriptLines=[])}}const Ur=Object.freeze(["                 _____                 ","               .'     '.               ","              /  ~~~~~  \\              ","             ;  ~ ~ ~ ~  ;             ","              \\  ~~~~~  /              ","           .---`-------'---.           ","         .'                 '.         ","        /=====================\\        ","       ;=======================;       ","      //@@@@@@@@@@@@@@@@@@@@@@@\\\\     ","     //@@@@%%%%%%%%%%%%%%%@@@@\\\\     ","    //@@%%%  Y U C C A  %%%%@@\\\\     ","    //@@%%%  Y U C C A  %%%%@@\\\\     ","    //@@@@%%%%%%%%%%%%%%%@@@@\\\\     ","     //@@@@%%%%%%%%%%%@@@@\\\\         ","    //@@===============@@\\\\           ","     //@@%%%%%%%%%%%@@\\\\              ","      //@@%%%%%%%%%@@\\\\                ","      ||  ...........  ||              ","      ||  ...........  ||              ","      |||             |||              ","      |||             |||              ","     _|||_           _|||_             ","    '====='         '====='            "]),yr=Ur.length,iv=Object.freeze({"/":"#e8edf2","\\":"#e8edf2","'":"#e8edf2","`":"#e8edf2","-":"#e8edf2",_:"#8fa3b8",".":"#d8c08a","~":"#c9ced4",";":"#e8edf2","=":"#5ac8ff","@":"#ff5a5a","%":"#ff7700","|":"#5a6b7d","!":"#5a6b7d"}),nv=new Set(["Y","U","C","A"]),sv="#fff6e0",rv="#33200e",mh=Object.freeze(["|","/","-","\\"]),gh=Object.freeze({connecting:"#8a97a6",connected:"#7dff8a",ready:"#ffe9c4",offline:"#ff9e3d"});class av{constructor(e,t={}){if(!e||typeof e.render!="function")throw new TypeError("[LoadingScreen] a Renderer is required.");this._renderer=e,this._title=t.title??"YUCCA",this._phase="connecting",this._statusText="waking the grove…",this._progress=.08,this._time=0,this._spin=0,this._weather=new Zu({cellWidth:e.cellWidth,cellHeight:e.cellHeight,seed:t.seed}),this._weather.setProfile(Xt.SPORE_DRIFT),this._weather.setLightningEnabled(!1),this._buffer=null,this._camera=null,this._rebuildSurface(),this._frames=0}setPhase(e,t=null){if(!Object.prototype.hasOwnProperty.call(gh,e))throw new RangeError(`[LoadingScreen] unknown phase: ${e}`);return this._phase=e,t!==null&&(this._statusText=t),e==="ready"&&(this._progress=1),this}setStatus(e){return this._statusText=String(e),this}setProgress(e){return this._progress=Math.min(1,Math.max(0,e)),this}get isReady(){return this._phase==="ready"||this._phase==="offline"}get phase(){return this._phase}setSeed(e){return this._weather.setSeed(e),this}update(e){return!Number.isFinite(e)||e<=0?this:(this._time+=e,this._spin=(this._spin+1)%mh.length,this._weather.update(e),!this.isReady&&this._progress<.9&&(this._progress=Math.min(.9,this._progress+e*.12)),this)}render(e=null){const t=e??this._renderer,i=this._buffer;i&&(i.clear(),this._weather.render(i,this._camera),this._stampPortrait(i),this._stampChrome(i),t.render(i,{x:0,y:0}),this._frames+=1)}_stampPortrait(e){const t=Ur[0].length,i=yr,n=Math.max(0,Math.floor((e.cols-t)/2)),s=Math.max(0,Math.floor((e.rows-i)/2)-1);for(let a=0;a<i;a+=1){const o=Ur[a],l=s+a;if(!(l<0||l>=e.rows))for(let c=0;c<o.length;c+=1){const h=o[c];if(h===" ")continue;const d=n+c;if(!(d<0||d>=e.cols))if(nv.has(h))e.setChar(d,l,h,sv,rv);else{const u=iv[h]??"#e8edf2";e.setChar(d,l,h,u,null)}}}}_stampChrome(e){const t=e.cols,n=Math.max(0,Math.floor((e.rows-yr)/2)-1)+yr+1,s=n+2,a=s+1,o=a+2,l=this._title;if(n<e.rows){const c=Math.max(0,Math.floor((t-l.length)/2));e.writeText(c,n,l,"#ff7700","#0b0e14")}if(s<e.rows){const c=Math.min(40,t-8),h=Math.max(0,Math.floor((t-c)/2)),d=Math.round(c*this._progress);for(let u=0;u<c;u+=1){const f=u<d?"▓":"░",m=u<d?"#ff7700":"#2b3648";e.setChar(h+u,s,f,m,null)}}if(a<e.rows){const h=`${this.isReady?"·":mh[this._spin]} ${this._statusText}`,d=Math.max(0,Math.floor((t-h.length)/2));e.writeText(d,a,h,gh[this._phase],null)}if(o<e.rows&&Math.floor(this._time*1.6)%2===0){const h=this._phase==="offline"?"[ SPACE ] explore solo (server offline)":"[ SPACE ] enter YUCCA",d=Math.max(0,Math.floor((t-h.length)/2));e.writeText(d,o,h,"#ffe9c4",null)}}handleResize(e=null){const t=(e==null?void 0:e.cssWidth)??this._renderer.viewportWidth,i=(e==null?void 0:e.cssHeight)??this._renderer.viewportHeight;return this._rebuildSurface(t,i),this}_rebuildSurface(e=null,t=null){const i=this._renderer.cellWidth,n=this._renderer.cellHeight,s=e??this._renderer.viewportWidth,a=t??this._renderer.viewportHeight,o=Math.max(Ur[0].length+2,Math.floor(s/i)),l=Math.max(yr+8,Math.floor(a/n));this._buffer=new Z({cols:o,rows:l,defaultChar:" ",defaultFg:"#e0e0e0",defaultBg:"#0b0e14"}),this._camera=new Ju({viewportWidth:o*i,viewportHeight:l*n,cellWidth:i,cellHeight:n}),this._weather.setCellMetrics(i,n),this._weather.attachCamera(this._camera)}getMetrics(){return{phase:this._phase,progress:this._progress,frames:this._frames,grid:this._buffer?`${this._buffer.cols}x${this._buffer.rows}`:null,ambient:this._weather.getMetrics()}}destroy(){this._weather.destroy()}}const Jt=Object.freeze({DREAM:"DREAM",DRAB:"DRAB"}),ov=.85,lv=.6,cv=.8,hv=.18,uv=27,xh=28,dv=2,fv=2.6,Ri=1e-4,vr=64,pv=.42,_v=.3,mv=.38,yh=.7,gv=.045,xv=.8,yv=.028,vv=112,vh=60,Sh=Object.freeze([Object.freeze([69,73,76,81]),Object.freeze([66,69,73,78]),Object.freeze([62,66,69,74]),Object.freeze([64,68,71,76])]),Mh=Object.freeze([45,42,38,40]),Eh=Object.freeze([Object.freeze([0,0,0]),Object.freeze([2,1,0]),Object.freeze([3,2,0]),Object.freeze([6,3,0]),Object.freeze([8,2,0]),Object.freeze([10,1,0]),Object.freeze([11,2,0]),Object.freeze([13,3,0]),Object.freeze([14,1,1])]),wh=Object.freeze([Object.freeze([45,57,60]),Object.freeze([41,57,60]),Object.freeze([50,57,62]),Object.freeze([40,52,56])]),Th=Object.freeze([69,72,74,76,79,81]),Sv=33,bh=Object.freeze({CLEAR_GROVE:0,MYSTIC_RAIN:.35,SPORE_DRIFT:.05,DRAB_DOWNPOUR:.85,DRAB_THUNDERSTORM:1});function Zt(r){return r<0?0:r>1?1:r}function vs(r){return 440*Math.pow(2,(r-69)/12)}function Mv(r){let e=r>>>0;return function(){e=e+1831565813|0;let i=Math.imul(e^e>>>15,e|1);return i^=i+Math.imul(i^i>>>7,i|61),((i^i>>>14)>>>0)/4294967296}}class Ev{constructor(e={}){if(e===null||typeof e!="object")throw new TypeError("[AudioEngine] options must be an object.");this._crossfadeSeconds=Number.isFinite(e.crossfadeSeconds)&&e.crossfadeSeconds>0?Math.min(15,e.crossfadeSeconds):fv,this._lookahead=Number.isFinite(e.lookaheadSeconds)&&e.lookaheadSeconds>.02?Math.min(1,e.lookaheadSeconds):hv,this._schedulerIntervalMs=Number.isInteger(e.schedulerIntervalMs)&&e.schedulerIntervalMs>=5?Math.min(250,e.schedulerIntervalMs):uv;const t=Number.isInteger(e.seed)?e.seed:(Date.now()^Math.random()*4294967295)>>>0;this._rng=Mv(t),this._seed=t,this._settings={master:Zt(e.masterVolume??ov),bgm:Zt(e.bgmVolume??lv),sfx:Zt(e.sfxVolume??cv),muted:!!e.muted};const i=e.world===Jt.DRAB?Jt.DRAB:Jt.DREAM;this._targetWorld=i,this._mixTarget=i===Jt.DRAB?1:0,this._fadeGraceUntil=0,this._rainTarget=0,this._ctx=null,this._failed=!1,this._destroyed=!1,this._booted=!1,this._gameSuspended=!1,this._schedulerId=null,this._activeSources=new Set,this._lastDialogueTickAt=-1,this._stepFoot=!1,this._droneOsc=null,this._dream={nextStepTime:0,totalSteps:0,stepDur:60/vv/4},this._drab={nextChordTime:0,chordIndex:0,chordDur:60/vh*4,nextMelodyTime:0,melodyStep:60/vh*2},this._worldManager=null,this._worldUnsubs=[],this._weather=null,this._onLightning=null,this._onWeatherProfile=null,this._onWeatherWorld=null,this._listeners=new Map,this._gestureHandler=null,this._gestureTarget=typeof window<"u"?window:null;try{const n=typeof window<"u"&&(window.AudioContext||window.webkitAudioContext);if(!n)throw new Error("Web Audio API unavailable.");this._ctx=new n({latencyHint:e.latencyHint??"balanced"}),this._buildGraph(),this._buildNoiseBuffer(),this._buildRain()}catch(n){console.warn("[AudioEngine] Web Audio unavailable; running silent.",n),this._failed=!0;return}this._ctx.state==="running"?this._boot():e.autoUnlock!==!1&&this._installUnlockListeners()}static isSupported(){return typeof window<"u"&&!!(window.AudioContext||window.webkitAudioContext)}get state(){return this._ctx?this._ctx.state:"closed"}get isLocked(){return!this._failed&&!this._booted}get targetWorld(){return this._targetWorld}_installUnlockListeners(){if(!this._gestureTarget)return;this._gestureHandler=()=>{this._removeUnlockListeners(),this.unlock()};const e={capture:!0,once:!1,passive:!0};this._gestureTarget.addEventListener("pointerdown",this._gestureHandler,e),this._gestureTarget.addEventListener("keydown",this._gestureHandler,e),this._gestureTarget.addEventListener("touchend",this._gestureHandler,e)}_removeUnlockListeners(){if(!this._gestureTarget||!this._gestureHandler)return;const e={capture:!0};this._gestureTarget.removeEventListener("pointerdown",this._gestureHandler,e),this._gestureTarget.removeEventListener("keydown",this._gestureHandler,e),this._gestureTarget.removeEventListener("touchend",this._gestureHandler,e),this._gestureHandler=null}async unlock(){if(this._failed||this._destroyed)return!1;if(this._booted)return!0;try{await this._ctx.resume()}catch(e){return console.warn("[AudioEngine] resume() rejected; will retry on gesture.",e),this._gestureHandler===null&&this._installUnlockListeners(),!1}return this._ctx.state==="running"?(this._boot(),!0):!1}_boot(){this._booted||this._destroyed||this._failed||(this._booted=!0,this._applySettingsToGraph(),this._startMusic(),this._schedulerId===null&&(this._schedulerId=setInterval(()=>this._schedule(),this._schedulerIntervalMs)),this._applyMixImmediate(this._mixTarget),this._setRainGains(this._rainTarget,!0),this._dispatch("unlocked",{state:this._ctx.state}))}async suspend(){if(!(this._failed||this._destroyed||!this._booted)){this._gameSuspended=!0;try{await this._ctx.suspend()}catch(e){console.warn("[AudioEngine] suspend() failed:",e)}}}async resume(){if(!(this._failed||this._destroyed||!this._booted)){this._gameSuspended=!1;try{await this._ctx.resume()}catch(e){console.warn("[AudioEngine] resume() failed:",e)}}}destroy(){this._destroyed||(this._destroyed=!0,this._schedulerId!==null&&(clearInterval(this._schedulerId),this._schedulerId=null),this._removeUnlockListeners(),this._detachWorldManager(),this._detachWeather(),this._listeners.clear(),this._activeSources.clear(),this._ctx&&this._ctx.state!=="closed"&&this._ctx.close().catch(()=>{}),this._ctx=null)}_validateLevel(e,t){if(!Number.isFinite(e))throw new RangeError(`[AudioEngine] ${t} must be a finite number.`);return Zt(e)}_glide(e,t,i=gv){if(!e)return;const n=e.gain,s=this._ctx.currentTime;n.cancelScheduledValues(s),n.setTargetAtTime(t,s,i)}_effectiveMaster(){return this._settings.muted?0:this._settings.master}_applySettingsToGraph(){this._failed||!this._ctx||(this._glide(this._masterGain,this._effectiveMaster()),this._glide(this._bgmGain,this._settings.bgm),this._glide(this._sfxGain,this._settings.sfx))}setMasterVolume(e){return this._settings.master=this._validateLevel(e,"masterVolume"),this._failed||this._glide(this._masterGain,this._effectiveMaster()),this}setBGMVolume(e){return this._settings.bgm=this._validateLevel(e,"bgmVolume"),this._failed||this._glide(this._bgmGain,this._settings.bgm),this}setSFXVolume(e){return this._settings.sfx=this._validateLevel(e,"sfxVolume"),this._failed||this._glide(this._sfxGain,this._settings.sfx),this}setMuted(e){return this._settings.muted=!!e,this._failed||this._glide(this._masterGain,this._effectiveMaster()),this._dispatch("mute",{muted:this._settings.muted}),this}toggleMuted(){return this.setMuted(!this._settings.muted),this._settings.muted}getSettings(){return{...this._settings}}applySettings(e){return e===null||typeof e!="object"?this:(Number.isFinite(e.master)&&this.setMasterVolume(e.master),Number.isFinite(e.bgm)&&this.setBGMVolume(e.bgm),Number.isFinite(e.sfx)&&this.setSFXVolume(e.sfx),typeof e.muted=="boolean"&&this.setMuted(e.muted),this)}_buildGraph(){const e=this._ctx;this._masterGain=e.createGain(),this._masterGain.gain.value=0,this._masterGain.connect(e.destination),this._bgmGain=e.createGain(),this._bgmGain.gain.value=0,this._bgmGain.connect(this._masterGain),this._dreamBus=e.createGain(),this._dreamBus.gain.value=1,this._dreamBus.connect(this._bgmGain),this._drabBus=e.createGain(),this._drabBus.gain.value=0,this._drabBus.connect(this._bgmGain),this._sfxGain=e.createGain(),this._sfxGain.gain.value=0,this._sfxGain.connect(this._masterGain),this._padFilter=e.createBiquadFilter(),this._padFilter.type="lowpass",this._padFilter.frequency.value=520,this._padFilter.Q.value=.5,this._padFilter.connect(this._drabBus),this._drabDelaySend=e.createGain(),this._drabDelaySend.gain.value=.5,this._drabDelay=e.createDelay(1.5),this._drabDelay.delayTime.value=.42,this._drabDelayReturnFilter=e.createBiquadFilter(),this._drabDelayReturnFilter.type="lowpass",this._drabDelayReturnFilter.frequency.value=950,this._drabDelayFeedback=e.createGain(),this._drabDelayFeedback.gain.value=.32,this._drabDelaySend.connect(this._drabDelay),this._drabDelay.connect(this._drabDelayReturnFilter),this._drabDelayReturnFilter.connect(this._drabDelayFeedback),this._drabDelayFeedback.connect(this._drabDelay),this._drabDelay.connect(this._drabBus),this._supportsPanner=typeof e.createStereoPanner=="function"}_buildNoiseBuffer(){const e=this._ctx,t=Math.max(1,Math.floor(e.sampleRate*dv));this._noiseBuffer=e.createBuffer(1,t,e.sampleRate);const i=this._noiseBuffer.getChannelData(0);for(let n=0;n<t;n+=1)i[n]=this._rng()*2-1}_buildRain(){const e=this._ctx;this._rainGain=e.createGain(),this._rainGain.gain.value=0,this._rainGain.connect(this._sfxGain);const t=e.createBufferSource();t.buffer=this._noiseBuffer,t.loop=!0;const i=e.createBiquadFilter();i.type="highpass",i.frequency.value=420;const n=e.createBiquadFilter();n.type="lowpass",n.frequency.value=7800,this._rainBedGain=e.createGain(),this._rainBedGain.gain.value=0,t.connect(i),i.connect(n),n.connect(this._rainBedGain),this._rainBedGain.connect(this._rainGain),t.start(0);const s=e.createBufferSource();s.buffer=this._noiseBuffer,s.loop=!0,s.playbackRate.value=1.13;const a=e.createBiquadFilter();a.type="bandpass",a.frequency.value=2600,a.Q.value=.9,this._rainPatterGain=e.createGain(),this._rainPatterGain.gain.value=0,s.connect(a),a.connect(this._rainPatterGain),this._rainPatterGain.connect(this._rainGain),s.start(0);const o=e.createBufferSource();o.buffer=this._noiseBuffer,o.loop=!0,o.playbackRate.value=.71;const l=e.createBiquadFilter();l.type="lowpass",l.frequency.value=240,this._rainBodyGain=e.createGain(),this._rainBodyGain.gain.value=0,o.connect(l),l.connect(this._rainBodyGain),this._rainBodyGain.connect(this._rainGain),o.start(0)}attachWorldManager(e){if(this._detachWorldManager(),!e||typeof e.on!="function")return this;if(this._worldManager=e,this._worldUnsubs.push(e.on("transitionstart",t=>{t&&typeof t.to=="string"&&this.setWorld(t.to,{seconds:this._crossfadeSeconds})})),this._worldUnsubs.push(e.on("worldchanged",t=>{t&&t.reason==="INITIAL"&&typeof t.to=="string"&&this.setWorld(t.to,{seconds:0})})),typeof e.getActiveWorldId=="function"){const t=e.getActiveWorldId();typeof t=="string"&&(this._targetWorld=t===Jt.DRAB?Jt.DRAB:Jt.DREAM,this._mixTarget=this._targetWorld===Jt.DRAB?1:0,this._booted&&this._applyMixImmediate(this._mixTarget))}return this}_detachWorldManager(){for(const e of this._worldUnsubs)try{e()}catch(t){console.warn("[AudioEngine] world unsubscribe failed:",t)}this._worldUnsubs=[],this._worldManager=null}setWorld(e,t={}){if(this._failed||this._destroyed||e!==Jt.DREAM&&e!==Jt.DRAB)return!1;const i=e===Jt.DRAB?1:0;if(i===this._mixTarget)return!1;const n=Number.isFinite(t.seconds)&&t.seconds>=0?Math.min(20,t.seconds):this._crossfadeSeconds;return this._targetWorld=e,this._mixTarget=i,this._booted&&(this._beginCrossfade(i,n),n>.05&&!t.silent&&this._playShiftSfx(e)),this._dispatch("worldmix",{world:e,seconds:n}),!0}_beginCrossfade(e,t){const n=this._ctx.currentTime;if(this._fadeGraceUntil=n+t,t<=.01){this._applyMixImmediate(e);return}const s=this._currentBusMix(),a=new Float32Array(vr),o=new Float32Array(vr);for(let h=0;h<vr;h+=1){const d=h/(vr-1),u=s+(e-s)*d;a[h]=Math.cos(u*Math.PI/2),o[h]=Math.sin(u*Math.PI/2)}const l=this._dreamBus.gain,c=this._drabBus.gain;l.cancelScheduledValues(n),c.cancelScheduledValues(n),l.setValueCurveAtTime(a,n,t),c.setValueCurveAtTime(o,n,t)}_applyMixImmediate(e){const t=this._ctx.currentTime,i=this._dreamBus.gain,n=this._drabBus.gain;i.cancelScheduledValues(t),n.cancelScheduledValues(t),i.setValueAtTime(Math.cos(e*Math.PI/2),t),n.setValueAtTime(Math.sin(e*Math.PI/2),t)}_currentBusMix(){const e=Zt(this._dreamBus.gain.value);return Zt(Math.acos(e)/(Math.PI/2))}_playShiftSfx(e){e===Jt.DRAB?(this._playTone({type:"sawtooth",freq:340,freqEnd:52,duration:1.1,peak:.16,dest:this._sfxGain,force:!0}),this._playNoise({duration:.5,peak:.2,force:!0,filter:{type:"bandpass",freq:900,Q:.6,freqEnd:180},dest:this._sfxGain}),this._playTone({type:"sine",freq:62,freqEnd:34,duration:.5,peak:.3,dest:this._sfxGain,force:!0})):(this._playTone({type:"triangle",freq:196,freqEnd:523,duration:.9,peak:.14,dest:this._sfxGain,force:!0}),this._playTone({type:"sine",freq:1568,duration:1.2,peak:.05,dest:this._sfxGain,force:!0}))}attachWeather(e){return this._detachWeather(),!e||typeof e.addEventListener!="function"?this:(this._weather=e,this._onLightning=t=>this.playThunder(t),this._onWeatherProfile=t=>{t&&typeof t.to=="string"&&bh[t.to]!==void 0&&this.setRainIntensity(bh[t.to])},this._onWeatherWorld=t=>{t&&this.setRainIntensity(t.world===Jt.DRAB?.9:.05)},e.addEventListener("lightning",this._onLightning),e.addEventListener("profilechange",this._onWeatherProfile),e.addEventListener("worldchange",this._onWeatherWorld),this)}_detachWeather(){const e=this._weather;e&&typeof e.removeEventListener=="function"&&(this._onLightning&&e.removeEventListener("lightning",this._onLightning),this._onWeatherProfile&&e.removeEventListener("profilechange",this._onWeatherProfile),this._onWeatherWorld&&e.removeEventListener("worldchange",this._onWeatherWorld)),this._weather=null,this._onLightning=null,this._onWeatherProfile=null,this._onWeatherWorld=null}setRainIntensity(e,t={}){return Number.isFinite(e)?(this._rainTarget=Zt(e),!this._failed&&this._booted&&this._setRainGains(this._rainTarget,!!t.immediate),this):this}_setRainGains(e,t){const i=Zt(e),n=pv*i,s=_v*i*i,a=mv*Math.max(0,(i-yh)/(1-yh)),o=t?.001:xv;this._glide(this._rainBedGain,n,o),this._glide(this._rainPatterGain,s,o),this._glide(this._rainBodyGain,a,o),this._glide(this._rainGain,i>.001?1:0,o)}playThunder(e={}){if(this._failed||this._destroyed||!this._booted)return this;if(this._ctx.state!=="running")return this;const t=Zt(Number.isFinite(e.intensity)?e.intensity:.8),i=Math.max(1,Math.min(4,Number.isInteger(e.strokeCount)?e.strokeCount:1));let n=0;e.region&&Number.isFinite(e.region.u0)&&Number.isFinite(e.region.u1)&&(n=Zt((e.region.u0+e.region.u1)/2)*2-1);const a=this._ctx.currentTime+.01,o=1.5+2.2*t;this._playNoise({startTime:a,duration:.03+.04*t,peak:.22+.28*t,attack:.002,pan:n,force:!0,filter:{type:"highpass",freq:1200},dest:this._sfxGain}),this._playNoise({startTime:a,duration:o,peak:.3+.4*t,attack:.008,pan:n,force:!0,filter:{type:"lowpass",freq:500+1100*t,freqEnd:60},dest:this._sfxGain});for(let l=1;l<i;l+=1){const c=.08+this._rng()*.18;this._playNoise({startTime:a+l*c+this._rng()*.05,duration:.5+.7*t,peak:(.14+.2*t)*(1-l/(i+1)),attack:.012,pan:n,force:!0,filter:{type:"lowpass",freq:300+400*t,freqEnd:70},dest:this._sfxGain})}return this._playTone({type:"sine",freq:55,freqEnd:30,duration:.5,peak:.25*t+.1,startTime:a,pan:n,force:!0,dest:this._sfxGain}),this._dispatch("thunder",{intensity:t,pan:n,strokeCount:i}),this}_startMusic(){const e=this._ctx.currentTime;this._dream.nextStepTime=e+.15,this._dream.totalSteps=0,this._drab.nextChordTime=e+.15,this._drab.chordIndex=0,this._drab.nextMelodyTime=e+2.2,this._startDrone()}_schedule(){if(this._failed||this._destroyed||!this._booted||this._ctx.state!=="running")return;const t=this._ctx.currentTime,i=t+this._lookahead;this._dream.nextStepTime<t-.5&&(this._dream.nextStepTime=t+.1),this._drab.nextChordTime<t-.5&&(this._drab.nextChordTime=t+.1,this._drab.nextMelodyTime=t+1.2);const n=this._mixTarget<.995||t<this._fadeGraceUntil;let s=0;for(;this._dream.nextStepTime<i&&s<512;)n&&this._scheduleDreamStep(this._dream.nextStepTime,this._dream.totalSteps),this._dream.totalSteps+=1,this._dream.nextStepTime+=this._dream.stepDur,s+=1;const a=this._mixTarget>.005||t<this._fadeGraceUntil;for(s=0;this._drab.nextChordTime<i&&s<64;)a&&this._padChord(this._drab.nextChordTime,wh[this._drab.chordIndex%wh.length],this._drab.chordDur),this._drab.chordIndex+=1,this._drab.nextChordTime+=this._drab.chordDur,s+=1;for(s=0;this._drab.nextMelodyTime<i&&s<64;){if(a&&this._rng()<.55){const o=Th[Math.floor(this._rng()*Th.length)];this._drabLead(this._drab.nextMelodyTime,o)}this._drab.nextMelodyTime+=this._drab.melodyStep,s+=1}}_scheduleDreamStep(e,t){const i=t%16,n=Math.floor(t/16),s=Sh[n%Sh.length],a=Mh[n%Mh.length];for(let o=0;o<Eh.length;o+=1){const[l,c,h]=Eh[o];if(l!==i)continue;let d=s[c%s.length]+(h?12:0);this._rng()<.14&&(d+=12);const u=i%4===0?1:.72;this._marimba(e,d,u)}if(i%4===2&&this._rng()<.12&&this._marimba(e+this._dream.stepDur*.5,s[3]+12,.4),i===0)this._bassNote(e,a,this._dream.stepDur*3.4,.24);else if(i===8)this._bassNote(e,a,this._dream.stepDur*2.6,.2);else if(i===14){const o=this._rng()<.4?a+7:a;this._bassNote(e,o,this._dream.stepDur*1.6,.16)}if(i%2===1){const o=i%8===7;this._hat(e,o?.08:.045)}}_marimba(e,t,i){const n=vs(t);this._playTone({type:"sine",freq:n,startTime:e,duration:.34,attack:.002,peak:.34*i,dest:this._dreamBus}),this._playTone({type:"sine",freq:n*4,startTime:e,duration:.11,attack:.002,peak:.07*i,dest:this._dreamBus})}_bassNote(e,t,i,n){this._playTone({type:"triangle",freq:vs(t),startTime:e,duration:i,attack:.006,peak:n,filter:{type:"lowpass",freq:340},dest:this._dreamBus})}_hat(e,t){this._playNoise({startTime:e,duration:.035,attack:.001,peak:t,filter:{type:"highpass",freq:6500},dest:this._dreamBus})}_padChord(e,t,i){const n=this._ctx;for(let s=0;s<t.length;s+=1){const a=vs(t[s]);for(const o of[-6,6]){const l=n.createOscillator();l.type="triangle",l.frequency.value=a,l.detune.value=o;const c=n.createGain(),h=e,d=e+i+2.4;c.gain.setValueAtTime(Ri,h),c.gain.linearRampToValueAtTime(.045,h+1.3),c.gain.setValueAtTime(.045,e+i),c.gain.exponentialRampToValueAtTime(Ri,d),l.connect(c),c.connect(this._padFilter),l.start(h),l.stop(d+.05),this._trackSource(l)}}}_drabLead(e,t){const i=this._ctx,n=i.createOscillator();n.type="triangle",n.frequency.value=vs(t);const s=i.createGain(),a=e,o=e+2.2;s.gain.setValueAtTime(Ri,a),s.gain.linearRampToValueAtTime(.09,a+.03),s.gain.exponentialRampToValueAtTime(Ri,o),n.connect(s),s.connect(this._drabBus),s.connect(this._drabDelaySend),n.start(a),n.stop(o+.05),this._trackSource(n)}_startDrone(){if(this._droneOsc||!this._ctx)return;const e=this._ctx,t=e.createOscillator();t.type="sine",t.frequency.value=vs(Sv);const i=e.createGain();i.gain.value=.05;const n=e.createOscillator();n.type="sine",n.frequency.value=.09;const s=e.createGain();s.gain.value=.015,n.connect(s),s.connect(i.gain),t.connect(i),i.connect(this._drabBus),t.start(),n.start(),this._droneOsc=t}_trackSource(e){this._activeSources.add(e),e.onended=()=>{this._activeSources.delete(e);try{e.disconnect()}catch{}}}_beginSfx(e){return!(this._failed||this._destroyed||!this._booted||this._ctx.state!=="running"||!e&&this._activeSources.size>=xh)}_makePan(e){if(!this._supportsPanner||e===null||e===void 0)return null;const t=this._ctx.createStereoPanner();return t.pan.value=Math.max(-1,Math.min(1,e)),t}_playTone(e){if(!this._beginSfx(!!e.force))return null;const t=this._ctx,i=Number.isFinite(e.startTime)?e.startTime:t.currentTime,n=Math.max(.02,Number.isFinite(e.duration)?e.duration:.2),s=Math.min(.1,Math.max(.001,e.attack??.004)),a=Zt(e.peak??.2),o=t.createOscillator();o.type=e.type??"sine",o.frequency.setValueAtTime(Math.max(1,e.freq),i),Number.isFinite(e.freqEnd)&&e.freqEnd>0&&o.frequency.exponentialRampToValueAtTime(e.freqEnd,i+n);let l=o;if(e.filter&&typeof e.filter=="object"){const d=t.createBiquadFilter();d.type=e.filter.type??"lowpass",d.frequency.value=e.filter.freq??800,d.Q.value=e.filter.Q??.8,l.connect(d),l=d}const c=this._makePan(e.pan??null);c&&(l.connect(c),l=c);const h=t.createGain();return h.gain.setValueAtTime(Ri,i),h.gain.linearRampToValueAtTime(Math.max(Ri,a),i+s),h.gain.exponentialRampToValueAtTime(Ri,i+n),l.connect(h),h.connect(e.dest??this._sfxGain),o.start(i),o.stop(i+n+.05),this._trackSource(o),o}_playNoise(e){if(!this._beginSfx(!!e.force))return null;const t=this._ctx,i=Number.isFinite(e.startTime)?e.startTime:t.currentTime,n=Math.max(.015,Number.isFinite(e.duration)?e.duration:.2),s=Math.min(.15,Math.max(.001,e.attack??.003)),a=Zt(e.peak??.2),o=t.createBufferSource();o.buffer=this._noiseBuffer,o.loop=!1,o.playbackRate.value=Number.isFinite(e.playbackRate)&&e.playbackRate>0?e.playbackRate:1;let l=o;if(e.filter&&typeof e.filter=="object"){const d=t.createBiquadFilter();d.type=e.filter.type??"lowpass",d.frequency.setValueAtTime(Math.max(20,e.filter.freq??800),i),d.Q.value=e.filter.Q??.8,Number.isFinite(e.filter.freqEnd)&&e.filter.freqEnd>0&&d.frequency.exponentialRampToValueAtTime(e.filter.freqEnd,i+n),l.connect(d),l=d}const c=this._makePan(e.pan??null);c&&(l.connect(c),l=c);const h=t.createGain();return h.gain.setValueAtTime(Ri,i),h.gain.linearRampToValueAtTime(Math.max(Ri,a),i+s),h.gain.exponentialRampToValueAtTime(Ri,i+n),l.connect(h),h.connect(e.dest??this._sfxGain),o.start(i),o.stop(i+n+.05),this._trackSource(o),o}uiMove(){return this._playTone({type:"square",freq:640,duration:.05,peak:.08}),this}uiConfirm(){const e=this._ctx?this._ctx.currentTime:0;return this._playTone({type:"square",freq:660,duration:.06,peak:.1,startTime:e}),this._playTone({type:"square",freq:990,duration:.08,peak:.1,startTime:e+.06}),this}uiCancel(){const e=this._ctx?this._ctx.currentTime:0;return this._playTone({type:"square",freq:520,duration:.06,peak:.1,startTime:e}),this._playTone({type:"square",freq:330,duration:.09,peak:.1,startTime:e+.06}),this}dialogueTick(e="a"){if(e===" "||e==="	"||e===`
`)return this;const t=this._ctx?this._ctx.currentTime:0;if(t-this._lastDialogueTickAt<yv)return this;this._lastDialogueTickAt=t;const i=1750+this._rng()*380;return this._playTone({type:"square",freq:i,duration:.018,peak:.045}),this}footstep(){return this._stepFoot=!this._stepFoot,this._playNoise({duration:.07,peak:.09,attack:.004,filter:{type:"lowpass",freq:this._stepFoot?750:950}}),this}pickup(){const e=this._ctx?this._ctx.currentTime:0;return this._playTone({type:"sine",freq:660,duration:.09,peak:.14,startTime:e}),this._playTone({type:"sine",freq:990,duration:.14,peak:.14,startTime:e+.08}),this}hurt(){return this._playTone({type:"sawtooth",freq:320,freqEnd:90,duration:.22,peak:.18}),this._playNoise({duration:.05,peak:.14,filter:{type:"bandpass",freq:1800,Q:1.2}}),this}impact(e=.6){const t=Zt(e);return this._playTone({type:"sine",freq:170+60*t,freqEnd:42,duration:.22+.12*t,peak:.16+.2*t}),this._playNoise({duration:.035,peak:.1+.12*t,filter:{type:"highpass",freq:2500}}),this}projectile(){return this._playTone({type:"square",freq:880,freqEnd:330,duration:.11,peak:.1}),this}dash(){return this._playNoise({duration:.24,peak:.14,attack:.02,filter:{type:"bandpass",freq:500,Q:1.1,freqEnd:2400}}),this}levelUp(){if(!this._beginSfx(!0))return this;const e=this._ctx.currentTime,t=[523.25,659.25,783.99,1046.5];for(let i=0;i<t.length;i+=1)this._playTone({type:"square",freq:t[i],startTime:e+i*.09,duration:i===t.length-1?.42:.12,peak:.13,force:!0});return this}questChime(){return this._playTone({type:"sine",freq:784,duration:.7,peak:.14}),this._playTone({type:"sine",freq:784*2.7,duration:.45,peak:.05}),this}skillReady(){return this._playTone({type:"triangle",freq:1180,duration:.1,peak:.1}),this}juiceDrink(){if(!this._beginSfx(!0))return this;const e=this._ctx.currentTime;for(let t=0;t<3;t+=1)this._playTone({type:"triangle",freq:320+t*150+this._rng()*60,startTime:e+t*.07,duration:.09,peak:.12,force:!0});return this._playNoise({startTime:e+.16,duration:.35,peak:.06,force:!0,filter:{type:"highpass",freq:3800}}),this}update(e){return!Number.isFinite(e)||e<=0?this:(this._schedule(),this)}addEventListener(e,t){if(typeof e!="string"||e.length===0)throw new TypeError("[AudioEngine] event type must be a string.");if(typeof t!="function")throw new TypeError("[AudioEngine] listener must be a function.");let i=this._listeners.get(e);return i||(i=new Set,this._listeners.set(e,i)),i.add(t),()=>this.removeEventListener(e,t)}removeEventListener(e,t){const i=this._listeners.get(e);return i&&(i.delete(t),i.size===0&&this._listeners.delete(e)),this}_dispatch(e,t){const i=this._listeners.get(e);if(i)for(const n of i)try{n(t)}catch(s){console.error(`[AudioEngine] '${e}' listener failed:`,s)}}getMetrics(){return{state:this.state,locked:this.isLocked,targetWorld:this._targetWorld,mixTarget:this._mixTarget,rainLevel:this._rainTarget,activeSources:this._activeSources.size,sfxCap:xh,schedulerRunning:this._schedulerId!==null,seed:this._seed,settings:this.getSettings()}}}function wv(r){let e=r>>>0;return function(){e=e+1831565813|0;let i=Math.imul(e^e>>>15,e|1);return i^=i+Math.imul(i^i>>>7,i|61),((i^i>>>14)>>>0)/4294967296}}function Vi(r){return r<0?0:r>1?1:r}const _t=Object.freeze({UI:"UI",COMBAT:"COMBAT",WORLD:"WORLD"}),ot=Object.freeze({UI_CLICK:"ui_click",UI_HOVER:"ui_hover",UI_OPEN:"ui_open",UI_CLOSE:"ui_close",UI_ERROR:"ui_error",DIALOGUE_TICK:"dialogue_tick",ITEM_GRAB:"item_grab",ITEM_EQUIP:"item_equip",ITEM_DROP:"item_drop",SWORD_SWING:"sword_swing",PROJECTILE_FIRE:"projectile_fire",LASER_HUM:"laser_hum",HIT_IMPACT:"hit_impact",HIT_CRITICAL:"hit_critical",PLAYER_HURT:"player_hurt",DEATH_DISSOLVE:"death_dissolve",DODGE_WHOOSH:"dodge_whoosh",FOOTSTEP:"footstep",REALITY_FLICKER:"reality_flicker",DIMENSION_SHIFT:"dimension_shift",JUICE_GULP:"juice_gulp",RAIN_SPLASH:"rain_splash"}),Tv=60,bv=.12,Av=.06,Cv=640,Rv=2,Pv=.85,Iv=14,Ah=3;class Dv{constructor(e,t={}){if(!e||typeof e._playTone!="function"||typeof e._playNoise!="function")throw new TypeError("[SoundEffects] A booted-or-bootable AudioEngine instance is required.");if(t===null||typeof t!="object")throw new TypeError("[SoundEffects] options must be an object.");this._engine=e,this._silent=e._ctx==null,this._ctx=e._ctx??null,this._bus=e._sfxGain??null;const i=Number.isInteger(t.seed)?t.seed:(Date.now()^Math.random()*4294967295)>>>0;this._rng=wv(i),this._seed=i;const n=t.pitchJitterCents??Tv;if(!Number.isFinite(n)||n<0||n>600)throw new RangeError("[SoundEffects] pitchJitterCents must be in [0, 600].");this._pitchJitterCents=n;const s=t.gainJitter??bv;if(!Number.isFinite(s)||s<0||s>.5)throw new RangeError("[SoundEffects] gainJitter must be in [0, 0.5].");this._gainJitter=s;const a=t.masterScale??1;if(!Number.isFinite(a)||a<0||a>2)throw new RangeError("[SoundEffects] masterScale must be in [0, 2].");this._masterScale=a;const o=t.maxDistance??Cv;if(!Number.isFinite(o)||o<=0)throw new RangeError("[SoundEffects] maxDistance must be positive.");this._maxDistance=o;const l=t.rolloffExponent??Rv;if(!Number.isFinite(l)||l<.5||l>4)throw new RangeError("[SoundEffects] rolloffExponent must be in [0.5, 4].");this._rolloffExponent=l;const c=t.panStrength??Pv;if(!Number.isFinite(c)||c<0||c>1)throw new RangeError("[SoundEffects] panStrength must be in [0, 1].");this._panStrength=c,this._active=null,this._listener=null,this._lastPlayedAt=new Map,this._warnedNames=new Set,this._destroyed=!1,this._rainIntensity=0,this._rainAccumulator=0,this._library=new Map,this._playCounts=new Map,this._totalPlays=0,this._registerBuiltinLibrary()}setPitchJitter(e){if(!Number.isFinite(e)||e<0||e>600)throw new RangeError("[SoundEffects] pitch jitter must be in [0, 600].");return this._pitchJitterCents=e,this}setGainJitter(e){if(!Number.isFinite(e)||e<0||e>.5)throw new RangeError("[SoundEffects] gain jitter must be in [0, 0.5].");return this._gainJitter=e,this}setDefaultMaxDistance(e){if(!Number.isFinite(e)||e<=0)throw new RangeError("[SoundEffects] maxDistance must be positive.");return this._maxDistance=e,this}attachListener(e){if(e!==null&&(!Number.isFinite(e.x)||!Number.isFinite(e.y)))throw new TypeError("[SoundEffects] listener must expose numeric x and y.");return this._listener=e,this}_define(e,t,i,n){return this._library.set(e,Object.freeze({fn:n,category:t,minInterval:Math.max(0,i)})),this}register(e,t,i={}){if(typeof e!="string"||e.length===0)throw new TypeError("[SoundEffects] effect name must be a non-empty string.");if(typeof t!="function")throw new TypeError("[SoundEffects] generator must be a function.");const n=Object.values(_t).includes(i.category)?i.category:_t.WORLD;return this._define(e,n,i.minInterval??0,t),this}has(e){return this._library.has(e)}play(e,t={}){if(this._destroyed||this._silent||this._engine.isLocked)return!1;const i=this._library.get(e);if(!i)return this._warnedNames.has(e)||(this._warnedNames.add(e),this._warnedNames.size<=32&&console.warn(`[SoundEffects] Unknown effect: '${e}'.`)),!1;const n=this._ctx.currentTime;if(i.minInterval>0){const s=this._lastPlayedAt.get(e);if(s!==void 0&&n-s<i.minInterval)return!1}this._lastPlayedAt.set(e,n),this._active={gainScale:Number.isFinite(t.gainScale)?Math.max(0,t.gainScale):1,pan:Number.isFinite(t.pan)?Math.max(-1,Math.min(1,t.pan)):null,filter:t.filter&&typeof t.filter=="object"?t.filter:null};try{i.fn(this,t)}catch(s){return console.error(`[SoundEffects] generator '${e}' failed:`,s),!1}finally{this._active=null}return this._totalPlays+=1,(this._playCounts.size<256||this._playCounts.has(e))&&this._playCounts.set(e,(this._playCounts.get(e)??0)+1),!0}playSpatialSFX(e,t,i,n,s,a,o={}){if(!Number.isFinite(t)||!Number.isFinite(i)||!Number.isFinite(n)||!Number.isFinite(s))return!1;const l=Number.isFinite(a)&&a>0?a:this._maxDistance,c=t-n,h=i-s,d=Math.hypot(c,h);if(d>=l)return!1;const u=d/l,f=Math.pow(1-u,this._rolloffExponent),m=Math.max(-1,Math.min(1,c/l))*this._panStrength;return this.play(e,{...o,gainScale:(Number.isFinite(o.gainScale)?o.gainScale:1)*f,pan:Number.isFinite(o.pan)?o.pan:m})}playAt(e,t,i,n={}){const s=this._listener;return!s||!Number.isFinite(s.x)||!Number.isFinite(s.y)?this.play(e,n):this.playSpatialSFX(e,t,i,s.x,s.y,n.maxDistance??this._maxDistance,n)}_cents(){return(this._rng()*2-1)*this._pitchJitterCents}_gainJit(){return 1+(this._rng()*2-1)*this._gainJitter}_tone(e){const t=this._active,i=e.jitter!==!1,n=i?this._cents():0,s=Math.pow(2,n/1200),a=Vi((e.peak??.2)*(t?t.gainScale:1)*(i?this._gainJit():1)*this._masterScale);return this._engine._playTone({type:e.type??"sine",freq:Math.max(1,(e.freq??440)*s),freqEnd:Number.isFinite(e.freqEnd)?Math.max(1,e.freqEnd*s):null,duration:e.duration??.2,attack:e.attack??.004,peak:a,startTime:Number.isFinite(e.at)?e.at:void 0,dest:this._bus,pan:e.pan??(t?t.pan:null),filter:e.filter??(t?t.filter:null),force:!!e.force})}_noise(e){const t=this._active,i=e.jitter!==!1,n=i?1+(this._rng()*2-1)*Av:1,s=Vi((e.peak??.2)*(t?t.gainScale:1)*(i?this._gainJit():1)*this._masterScale);return this._engine._playNoise({duration:e.duration??.2,attack:e.attack??.003,peak:s,playbackRate:(e.playbackRate??1)*n,startTime:Number.isFinite(e.at)?e.at:void 0,dest:this._bus,pan:e.pan??(t?t.pan:null),filter:e.filter??(t?t.filter:null),force:!!e.force})}_begin(e=!1){return this._engine._beginSfx(!!e)}_track(e){this._engine._trackSource(e)}setRainIntensity(e){return Number.isFinite(e)?(this._rainIntensity=Vi(e),this._rainIntensity===0&&(this._rainAccumulator=0),this):this}update(e){if(this._destroyed||!Number.isFinite(e)||e<=0)return this;if(this._rainIntensity<=0||this._engine.isLocked)return this;this._rainAccumulator+=this._rainIntensity*Iv*e;let t=Math.floor(this._rainAccumulator);this._rainAccumulator-=t,t>Ah&&(t=Ah,this._rainAccumulator=0);for(let i=0;i<t;i+=1)this.play(ot.RAIN_SPLASH,{pan:this._rng()*2-1,gainScale:.3+this._rng()*.7});return this}_registerBuiltinLibrary(){this._define(ot.UI_CLICK,_t.UI,.03,e=>{const t=e._ctx.currentTime;e._tone({type:"square",freq:880,freqEnd:660,duration:.03,attack:.002,peak:.09,at:t}),e._noise({duration:.012,attack:.001,peak:.06,at:t,filter:{type:"highpass",freq:4200}})}),this._define(ot.UI_HOVER,_t.UI,.045,e=>{e._tone({type:"sine",freq:1400,freqEnd:1750,duration:.022,attack:.003,peak:.035})}),this._define(ot.UI_OPEN,_t.UI,.08,e=>{const t=e._ctx.currentTime,i=[440,554.37,659.25];for(let n=0;n<i.length;n+=1)e._tone({type:"triangle",freq:i[n],duration:.07,attack:.004,peak:.08,at:t+n*.045})}),this._define(ot.UI_CLOSE,_t.UI,.08,e=>{const t=e._ctx.currentTime,i=[659.25,554.37,440];for(let n=0;n<i.length;n+=1)e._tone({type:"triangle",freq:i[n],duration:.07,attack:.004,peak:.07,at:t+n*.04})}),this._define(ot.UI_ERROR,_t.UI,.12,e=>{const t=e._ctx.currentTime;e._tone({type:"square",freq:220,duration:.08,peak:.08,at:t}),e._tone({type:"square",freq:196,duration:.1,peak:.08,at:t+.09})}),this._define(ot.DIALOGUE_TICK,_t.UI,.028,e=>{e._tone({type:"square",freq:1900,duration:.018,attack:.002,peak:.045})}),this._define(ot.ITEM_GRAB,_t.UI,.07,e=>{const t=e._ctx.currentTime;e._tone({type:"sine",freq:520,freqEnd:620,duration:.05,peak:.11,at:t}),e._tone({type:"sine",freq:660,freqEnd:780,duration:.07,peak:.11,at:t+.05}),e._noise({duration:.06,attack:.004,peak:.06,at:t,filter:{type:"bandpass",freq:1300,Q:.8}})}),this._define(ot.ITEM_EQUIP,_t.UI,.1,e=>{const t=e._ctx.currentTime;e._tone({type:"sine",freq:784,duration:.32,peak:.12,at:t}),e._tone({type:"sine",freq:784*3.01,duration:.18,peak:.04,at:t}),e._noise({duration:.2,attack:.05,peak:.05,at:t,filter:{type:"bandpass",freq:2400,Q:.7}})}),this._define(ot.ITEM_DROP,_t.UI,.08,e=>{const t=e._ctx.currentTime;e._tone({type:"sine",freq:420,freqEnd:180,duration:.1,peak:.1,at:t}),e._tone({type:"sine",freq:90,duration:.09,peak:.12,at:t+.1}),e._noise({duration:.04,peak:.06,at:t+.1,filter:{type:"lowpass",freq:900}})}),this._define(ot.SWORD_SWING,_t.COMBAT,.06,(e,t)=>{const i=t.swing==="backhand";e._noise({duration:.13,attack:.015,peak:.2,filter:{type:"bandpass",freq:i?2600:300,freqEnd:i?300:2600,Q:1.1}}),e._tone({type:"sine",freq:95,duration:.06,peak:.1})}),this._define(ot.PROJECTILE_FIRE,_t.COMBAT,.02,e=>{const t=e._ctx.currentTime;e._tone({type:"square",freq:640,freqEnd:210,duration:.09,peak:.09,at:t}),e._noise({duration:.02,peak:.05,at:t,filter:{type:"highpass",freq:3200}})}),this._define(ot.LASER_HUM,_t.COMBAT,.15,(e,t)=>{if(!e._begin(!!t.force))return;const i=e._ctx,n=i.currentTime,s=Number.isFinite(t.duration)?Math.min(4,Math.max(.2,t.duration)):.9,a=Number.isFinite(t.freq)?t.freq:110,o=e._active,l=(o?o.gainScale:1)*e._masterScale,c=i.createBiquadFilter();c.type="bandpass",c.frequency.value=820,c.Q.value=1.4;const h=i.createGain();h.gain.setValueAtTime(1e-4,n),h.gain.linearRampToValueAtTime(Vi(.16*l),n+.05),h.gain.setValueAtTime(Vi(.16*l),n+s),h.gain.exponentialRampToValueAtTime(1e-4,n+s+.15);const d=e._engine._makePan(o?o.pan:null);c.connect(h),d?(h.connect(d),d.connect(e._bus)):h.connect(e._bus);const u=[1,2.01];for(let y=0;y<u.length;y+=1){const p=i.createOscillator();p.type="sawtooth",p.frequency.value=a*u[y];const _=i.createGain();_.gain.value=y===0?.6:.25,p.connect(_),_.connect(c),p.start(n),p.stop(n+s+.25),e._track(p)}const f=i.createOscillator();f.type="sine",f.frequency.value=6;const m=i.createGain();m.gain.value=9,f.connect(m),m.connect(c.frequency),f.start(n),f.stop(n+s+.25),e._track(f)}),this._define(ot.HIT_IMPACT,_t.COMBAT,.03,(e,t)=>{const i=Vi(Number.isFinite(t.intensity)?t.intensity:.6),n=e._ctx.currentTime;e._tone({type:"sine",freq:170+70*i,freqEnd:42,duration:.2+.14*i,peak:.16+.2*i,at:n}),e._noise({duration:.03,peak:.08+.12*i,at:n,filter:{type:"highpass",freq:2600}})}),this._define(ot.HIT_CRITICAL,_t.COMBAT,.06,e=>{const t=e._ctx.currentTime;e._tone({type:"sine",freq:988,duration:.05,peak:.13,at:t}),e._tone({type:"sine",freq:1319,duration:.09,peak:.13,at:t+.05}),e._tone({type:"sine",freq:1318.5,duration:.4,peak:.09,at:t+.1}),e._tone({type:"sine",freq:1318.5*2.7,duration:.22,peak:.03,at:t+.1})}),this._define(ot.PLAYER_HURT,_t.COMBAT,.1,e=>{const t=e._ctx.currentTime;e._tone({type:"sawtooth",freq:300,freqEnd:85,duration:.2,peak:.17,at:t}),e._noise({duration:.05,peak:.12,at:t,filter:{type:"bandpass",freq:1700,Q:1.2}})}),this._define(ot.DEATH_DISSOLVE,_t.COMBAT,.2,e=>{const t=e._ctx.currentTime;e._tone({type:"sawtooth",freq:220,freqEnd:38,duration:.7,peak:.16,at:t}),e._tone({type:"sawtooth",freq:226,freqEnd:36,duration:.75,peak:.1,at:t}),e._noise({duration:.5,attack:.02,peak:.1,at:t+.1,filter:{type:"highpass",freq:2200}})}),this._define(ot.DODGE_WHOOSH,_t.COMBAT,.08,e=>{e._noise({duration:.22,attack:.03,peak:.13,filter:{type:"bandpass",freq:500,freqEnd:2400,Q:1.1}})}),this._define(ot.FOOTSTEP,_t.COMBAT,.09,e=>{e._stepFoot=!e._stepFoot,e._noise({duration:.06,attack:.004,peak:.08,filter:{type:"lowpass",freq:e._stepFoot?720:940}})}),this._define(ot.REALITY_FLICKER,_t.WORLD,.2,(e,t)=>{if(!e._begin(!!t.force))return;const i=e._ctx,n=i.currentTime,s=Number.isFinite(t.duration)?Math.min(6,Math.max(.3,t.duration)):1.2,a=e._active,o=(a?a.gainScale:1)*e._masterScale,l=i.createBiquadFilter();l.type="lowpass",l.frequency.value=320;const c=i.createGain();c.gain.setValueAtTime(1e-4,n),c.gain.linearRampToValueAtTime(Vi(.11*o),n+.12),c.gain.setValueAtTime(Vi(.11*o),n+s),c.gain.exponentialRampToValueAtTime(1e-4,n+s+.25);const h=i.createOscillator();h.type="sine",h.frequency.value=9;const d=i.createGain();d.gain.value=Vi(.044*o),h.connect(d),d.connect(c.gain);const u=e._engine._makePan(a?a.pan:null);l.connect(c),u?(c.connect(u),u.connect(e._bus)):c.connect(e._bus);const f=[55,57.3];for(let m=0;m<f.length;m+=1){const y=i.createOscillator();y.type="triangle",y.frequency.value=f[m],y.connect(l),y.start(n),y.stop(n+s+.35),e._track(y)}h.start(n),h.stop(n+s+.35),e._track(h)}),this._define(ot.DIMENSION_SHIFT,_t.WORLD,.4,(e,t)=>{const i=t.direction==="DRAB",n=e._ctx.currentTime;i?(e._tone({type:"sawtooth",freq:320,freqEnd:52,duration:1,peak:.15,force:!0,at:n}),e._noise({duration:.55,attack:.02,peak:.18,force:!0,at:n,filter:{type:"bandpass",freq:900,freqEnd:170,Q:.7}}),e._tone({type:"sine",freq:62,freqEnd:33,duration:.5,peak:.28,force:!0,at:n})):(e._tone({type:"triangle",freq:180,freqEnd:540,duration:.9,attack:.08,peak:.13,force:!0,at:n}),e._tone({type:"sine",freq:1568,duration:1.2,attack:.15,peak:.05,force:!0,at:n+.2}),e._noise({duration:.6,attack:.1,peak:.08,force:!0,at:n,filter:{type:"bandpass",freq:400,freqEnd:2600,Q:.6}}))}),this._define(ot.JUICE_GULP,_t.WORLD,.2,e=>{const t=e._ctx.currentTime;for(let i=0;i<3;i+=1)e._tone({type:"sine",freq:330-i*70,freqEnd:150-i*28,duration:.09,attack:.01,peak:.13,at:t+i*.11});e._noise({duration:.3,attack:.04,peak:.05,at:t+.34,filter:{type:"highpass",freq:4200}})}),this._define(ot.RAIN_SPLASH,_t.WORLD,.05,e=>{const t=e._ctx.currentTime;e._noise({duration:.03,peak:.05,at:t,filter:{type:"highpass",freq:3600}}),e._tone({type:"sine",freq:1900,freqEnd:700,duration:.045,attack:.002,peak:.04,at:t})}),this._stepFoot=!1}getMetrics(){const e={};for(const[t,i]of this._playCounts)e[t]=i;return{seed:this._seed,totalPlays:this._totalPlays,perName:e,librarySize:this._library.size,pitchJitterCents:this._pitchJitterCents,gainJitter:this._gainJitter,maxDistance:this._maxDistance,rolloffExponent:this._rolloffExponent,rainIntensity:this._rainIntensity,destroyed:this._destroyed}}destroy(){this._destroyed||(this._destroyed=!0,this._engine=null,this._ctx=null,this._bus=null,this._listener=null,this._active=null,this._library.clear(),this._lastPlayedAt.clear(),this._playCounts.clear(),this._warnedNames.clear(),this._rainIntensity=0,this._rainAccumulator=0)}}const ze=Object.freeze({LOADING:"LOADING",MAIN_MENU:"MAIN_MENU",PLAYING:"PLAYING",PAUSED:"PAUSED",DIALOGUE_ACTIVE:"DIALOGUE_ACTIVE",GAME_OVER:"GAME_OVER"});function Qa(r){return r<0?0:r>1?1:r}function Ch(r){const e=Math.sin(r*31.7)*Math.sin(r*17.3)+Math.sin(r*7.9);return Math.min(1,Math.abs(e)/2)}class Lv{constructor(e,t={}){if(!e||typeof e.getContext!="function")throw new TypeError("[Game] A canvas element is required.");if(t===null||typeof t!="object")throw new TypeError("[Game] options must be an object.");if(this._canvas=e,this._ctx=e.getContext("2d"),!this._ctx)throw new TypeError("[Game] Unable to acquire a 2D context.");this._options=t,this._state=ze.LOADING,this._started=!1,this._simTime=0,this._listeners=new Map;const i=this._measureDisplay();this._renderer=new bd(this._ctx,i),this._gl=null;const n=t.glCanvas??null;if(n)try{const s=new Z0(n,{cellWidth:this._renderer.cellWidth,cellHeight:this._renderer.cellHeight});s.isSupported?(s.handleResize(i),this._gl=s,this._renderer.setGLDelegate(s),console.info("%cYUCCA%c hybrid GPU presenter online (%s)","color:#ff7700;font-weight:bold;","color:#d7e3ee;",s.backend)):(s.destroy(),console.info("[Game] WebGL unavailable — Canvas 2D presenter active."))}catch(s){console.warn("[Game] GPU presenter failed to boot — Canvas 2D fallback:",s),this._gl=null}this._input=new ex(window,e,t.input??{}),this._worlds=new dx(this._renderer,{initialWorld:t.initialWorld??He.DREAM,...t.worlds??{}}),this._camera=this._worlds.getCamera(),this._weather=new Zu({cellWidth:this._renderer.cellWidth,cellHeight:this._renderer.cellHeight,seed:t.seed,world:this._worlds.getActiveWorldId()}),this._weather.attachCamera(this._camera),this._audio=new Ev({seed:t.seed,world:this._worlds.getActiveWorldId(),...t.audio??{}}),this._audio.attachWorldManager(this._worlds),this._audio.attachWeather(this._weather),this._sfx=new Dv(this._audio,{seed:t.seed}),this._sfx.attachListener(this._camera),this._ui=new ey(this._renderer),this._ui.attachWorldManager(this._worlds),this._ui.attachCamera(this._camera),this._hud=new qr(this._renderer),this._hud.attachWorldManager(this._worlds),this._hud.attachCamera(this._camera),this._hud.attachInputManager(this._input),this._dialogue=new _h(this._renderer,{charsPerSecond:55}),this._loadingScreen=new av(this._renderer,{seed:t.seed}),this._player=null,this._energy=null,this._combat=null,this._quest=null,this._entities=null,this._inventory=null,this._network=null,this._waterShader=null,this._terrainStampers=new Map,this._worldLights=[],this._activeNPC=null,this._interactableNPCs=new Set,this._worldUnsubs=[this._worlds.on("worldchanged",s=>this._onWorldChanged(s)),this._worlds.on("transitionstart",s=>this._onTransitionStart(s)),this._worlds.on("transitioncomplete",s=>this._onTransitionComplete(s))],this._dialogue.addEventListener("advance",()=>{this._activeNPC&&this._activeNPC.advanceDialogue()}),this._dialogue.addEventListener("optionselected",({index:s})=>{this._activeNPC&&(_h.syncChoiceCursor(this._activeNPC,s),this._activeNPC.advanceDialogue())}),this._dialogue.addEventListener("abort",()=>{this._activeNPC&&this._activeNPC.endDialogue("closed")}),this._hud.addEventListener("energycritical",({critical:s})=>{s&&this._sfx.play(ot.REALITY_FLICKER,{duration:1.2})}),this._loop=new _d({fixedTimeStep:t.fixedTimeStep??1/60,maxFrameSkips:t.maxFrameSkips??5,update:s=>this._update(s),render:s=>this._render(s)})}attachPlayer(e){return this._player=e,e?(this._worlds.setPlayerTarget(e),this._hud.attachPlayer(e),this._ui.attachPlayer(e),this._sfx.attachListener(e),typeof e.addEventListener=="function"&&e.addEventListener("hurt",()=>this._sfx.play(ot.PLAYER_HURT)),this._dialogue.setPlayerName(typeof e.name=="string"?e.name:null),this):this}attachEnergySystem(e){return this._energy=e,e&&typeof e.addEventListener=="function"&&(e.addEventListener("depleted",()=>this.requestDimensionShift(He.DRAB,pn.ENERGY_DEPLETED)),e.addEventListener("restored",()=>this.requestDimensionShift(He.DREAM,pn.JUICE_CONSUMED))),this}attachCombatSystem(e){return this._combat=e,this}attachQuestSystem(e){return this._quest=e,e&&this._ui.attachQuestSystem(e),this}attachEntityManager(e){return this._entities=e,this}attachInventorySystem(e){return this._inventory=e,e&&this._ui.attachInventory(e),this}attachNetworkManager(e){return this._network=e,this}attachWaterShader(e){if(this._waterShader=e,e&&this._gl&&typeof e.getMetrics=="function"){const{waterGlyphs:t}=e.getMetrics();this._gl.setWaterGlyphs(t??[])}return this}registerWorldLight(e){if(!e||!Number.isFinite(e.x)||!Number.isFinite(e.y))throw new TypeError("[Game] world light requires numeric x and y.");return this._worldLights.push({world:e.world??null,x:e.x,y:e.y,radius:Number.isFinite(e.radius)&&e.radius>0?e.radius:140,color:typeof e.color=="string"?e.color:"#ffb46b",intensity:Number.isFinite(e.intensity)?e.intensity:.5}),this}setTerrainStamper(e,t){if(typeof e!="string"||typeof t!="function")throw new TypeError("[Game] stamper must be a function.");return this._terrainStampers.set(e,t),this}registerInteractableNPC(e){if(!e||typeof e.addEventListener!="function")throw new TypeError("[Game] npc must expose addEventListener.");return e.addEventListener("rangeenter",()=>{this._ui.setHint(`[E] Speak with ${e.name}`)}),e.addEventListener("rangeexit",()=>{this._ui.setHint(null)}),e.addEventListener("dialogueend",()=>{this._handleDialogueEnd(e)}),this._quest&&typeof e.attachQuestSystem=="function"&&e.attachQuestSystem(this._quest),this._interactableNPCs.add(e),this}async start(){if(this._started)return this;this._started=!0,this.setState(ze.LOADING),this._loop.start();try{await Promise.all([this._worlds.loadWorldBuffer(He.DREAM),this._worlds.loadWorldBuffer(He.DRAB)])}catch(e){console.error("[Game] world preload failed:",e)}return this.setState(ze.MAIN_MENU),this}startGame(){return this._state!==ze.MAIN_MENU&&this._state!==ze.GAME_OVER&&this._state!==ze.LOADING?this:(this._player&&typeof this._player.setControlEnabled=="function"&&this._player.setControlEnabled(!0),this.setState(ze.PLAYING),this.emit("gamestart",{world:this._worlds.getActiveWorldId()}),this)}destroy(){this._loop.stop();for(const e of this._worldUnsubs)try{e()}catch(t){console.warn("[Game] world unsubscribe failed:",t)}this._worldUnsubs=[],this._input.destroy(),this._sfx.destroy(),this._audio.destroy(),this._ui.destroy(),this._hud.destroy(),this._dialogue.destroy(),this._weather.destroy(),this._loadingScreen.destroy(),this._gl&&(this._gl.destroy(),this._gl=null),this._renderer.setGLDelegate(null),this._interactableNPCs.clear(),this._terrainStampers.clear(),this._worldLights.length=0,this._listeners.clear()}get state(){return this._state}setState(e){if(!Object.values(ze).includes(e))throw new RangeError(`[Game] Unknown state: ${e}.`);if(e===this._state)return this;const t=this._state;return this._exitState(t),this._state=e,this._enterState(e),this.emit("statechange",{from:t,to:e}),this}_exitState(e){e===ze.PAUSED&&this._audio.resume()}_enterState(e){switch(e){case ze.PAUSED:this._audio.suspend();break;case ze.DIALOGUE_ACTIVE:this._player&&typeof this._player.setControlEnabled=="function"&&this._player.setControlEnabled(!1);break;case ze.PLAYING:this._player&&typeof this._player.setControlEnabled=="function"&&this._player.setControlEnabled(!0);break}}_update(e){this._simTime+=e,this._audio.update(e),this._input.update();const t=this._state===ze.PLAYING||this._state===ze.DIALOGUE_ACTIVE;switch(t&&this._worlds.update(e,null),(t||this._state===ze.MAIN_MENU)&&this._handleZoomInput(),this._state){case ze.LOADING:this._updateLoadingScreen(e);break;case ze.MAIN_MENU:this._updateLoadingScreen(e),this._updateMainMenu();break;case ze.PLAYING:this._updatePlaying(e);break;case ze.PAUSED:this._updatePaused();break;case ze.DIALOGUE_ACTIVE:this._updateDialogue(e);break;case ze.GAME_OVER:this._updateGameOver();break}(t||this._state===ze.MAIN_MENU)&&(this._weather.update(e),this._waterShader&&typeof this._waterShader.update=="function"&&this._waterShader.update(e))}_updateLoadingScreen(e){this._loadingScreen.update(e),this._loadingScreen.isReady&&(this._input.isActionJustPressed("ACTION")||this._input.isActionJustPressed("INTERACT"))&&this.startGame()}_updateMainMenu(){(this._input.isActionJustPressed("ACTION")||this._input.isActionJustPressed("INTERACT"))&&this.startGame()}_updatePlaying(e){this._handleGlobalInput(),this._ui.update(e,this._input),this._player&&!this._ui.isGameplayInputBlocked()&&(typeof this._player.handleInput=="function"&&this._player.handleInput(this._input),typeof this._player.update=="function"&&this._player.update(e)),this._entities&&typeof this._entities.update=="function"&&this._entities.update(e,this._player),this._energy&&typeof this._energy.update=="function"&&this._energy.update(e,this._input),this._combat&&typeof this._combat.update=="function"&&this._combat.update(e),this._quest&&typeof this._quest.update=="function"&&this._quest.update(e),this._hud.update(e),this._sfx.update(e),this._network&&typeof this._network.update=="function"&&this._network.update(e)}_updatePaused(){(this._input.isActionJustPressed("PAUSE")||this._input.isActionJustPressed("ACTION"))&&this.setState(ze.PLAYING)}_updateDialogue(e){const t=this._activeNPC;if(!t){this.setState(ze.PLAYING);return}typeof t.handleInput=="function"&&t.handleInput(this._input),typeof t.update=="function"&&t.update(e,this._player),typeof t.getDialogueView=="function"&&this._dialogue.present(t.getDialogueView()),this._dialogue.update(e,this._input),this._hud.update(e),this._sfx.update(e)}_updateGameOver(){this._input.isActionJustPressed("ACTION")&&this.setState(ze.MAIN_MENU)}_handleGlobalInput(){if(this._input.isActionJustPressed("PAUSE")&&!this._ui.hasBlockingPanel()){this.setState(ze.PAUSED);return}if(this._input.isActionJustPressed("DIMENSION_FOCUS")){const e=this._worlds.isDream()?He.DRAB:He.DREAM;this.requestDimensionShift(e,pn.SCRIPTED)}this._input.isActionJustPressed("INTERACT")&&this._tryInteract()}_handleZoomInput(){if(!this._camera)return;const e=this._input.consumeWheelDelta();if(e&&e.deltaY!==0){const n=Math.exp(-e.deltaY*.0016);this._camera.zoomAt(n,e.anchorX,e.anchorY)}const t=this._camera.physicalWidth/2,i=this._camera.physicalHeight/2;this._input.isActionJustPressed("ZOOM_IN")&&this._camera.zoomAt(1.25,t,i),this._input.isActionJustPressed("ZOOM_OUT")&&this._camera.zoomAt(.8,t,i),this._input.isActionJustPressed("ZOOM_RESET")&&this._camera.setZoom(1,t,i)}_syncGLFrameState(){if(!this._gl)return;const e=this._weather.getMetrics(),t=e.poolCapacity>0?e.liveParticles/e.poolCapacity:0,i=this._energy&&Number.isFinite(this._energy.fraction)?this._energy.fraction:1,n=i<=.25?(.25-i)/.25:0,s=this._worlds.isDrab(),a=[];this._player&&Number.isFinite(this._player.x)&&a.push({x:this._player.x,y:this._player.y,radius:150,intensity:.34,color:s?"#9ad7ff":"#ffb46b"});const o=this._worlds.getActiveWorldId();for(const c of this._worldLights)c.world!==null&&c.world!==o||a.push(c);let l=null;if(this._waterShader&&typeof this._waterShader.getMetrics=="function"){const c=this._waterShader.getMetrics();l={frequency:c.frequency,amplitude:c.amplitude,speed:c.speed}}this._gl.setFrameState({flash:this._weather.flashIntensity,rain:t,gloom:e.gloom,glitch:n,grayscale:this._renderer.grayscale?1:0,tint:s?"#a9b8c6":"#ffb46b",tintStrength:s?.16:.1,water:l,lights:a})}_tryInteract(){if(this._state===ze.PLAYING){for(const e of this._interactableNPCs)if(typeof e.canInteract=="function"&&e.canInteract()){this._beginDialogue(e);return}}}_beginDialogue(e){this._state===ze.PLAYING&&typeof e.beginDialogue=="function"&&(e.beginDialogue(this._player),e.inDialogue&&(this._activeNPC=e,this._player&&typeof this._player.setControlEnabled=="function"&&this._player.setControlEnabled(!1),typeof e.getDialogueView=="function"&&this._dialogue.present(e.getDialogueView()),this._ui.setHint(null),this.setState(ze.DIALOGUE_ACTIVE),this.emit("dialogueopen",{npcId:e.id??null})))}_handleDialogueEnd(e){this._activeNPC===e&&(this._activeNPC=null,this._player&&typeof this._player.setControlEnabled=="function"&&this._player.setControlEnabled(!0),this._state===ze.DIALOGUE_ACTIVE&&this.setState(ze.PLAYING),this.emit("dialogueclose",{npcId:e.id??null}))}requestDimensionShift(e,t=pn.SCRIPTED){if(this._worlds.getActiveWorldId()===e&&!this._worlds.isTransitioning())return!1;const i=this._worlds.requestShift(e,t);return i&&this.emit("dimensionrequest",{target:e,reason:t}),i}_onWorldChanged(e){const t=e.to;this._weather.setWorld(t),this._player&&(typeof this._player.setDimension=="function"?this._player.setDimension(t):typeof this._player.setForm=="function"&&this._player.setForm(t===He.DRAB?"SUIT":"PONCHO")),this._sfx.play(ot.DIMENSION_SHIFT,{direction:t}),this._ui.announce(t===He.DRAB?"THE DRAB WORLD":"THE DREAM WORLD"),this.emit("dimensionshift",e)}_onTransitionStart(e){this.emit("transitionstart",e)}_onTransitionComplete(e){this.emit("transitioncomplete",e)}_render(e){const t=this._renderer;t.beginFrame(),this._syncGLFrameState(),this._state===ze.LOADING||this._state===ze.MAIN_MENU?this._loadingScreen.render(t):(this._presentWorld(t,e),this._hud.render(e),this._dialogue.render(e),this._ui.render(e),this._renderTransitionOverlay(t),this._state===ze.PAUSED&&this._renderPauseOverlay(t),this._state===ze.GAME_OVER&&this._renderGameOverOverlay(t)),t.endFrame()}_presentWorld(e,t){const i=this._worlds.getActiveBuffer(),n=this._worlds.getCamera();if(!i||!n)return;i.clear();const s=this._worlds.getActiveWorldId(),a=this._terrainStampers.get(s);a&&a(i,n),this._entities&&typeof this._entities.render=="function"&&this._entities.render(i,n,t),this._weather.render(i,n),this._waterShader&&typeof this._waterShader.render=="function"&&this._waterShader.render(i),this._worlds.render(e,t)}_renderTransitionOverlay(e){const t=this._worlds.getTransitionStatus();if(!t||!t.active)return;const i=e.getViewportGridSize(),n=i.columns*e.cellWidth,s=i.rows*e.cellHeight;if(t.fade>.001&&e.drawRect(0,0,n,s,`rgba(0,0,0,${Qa(t.fade)*.97})`),t.flicker>.001){const a=Qa(t.flicker),o=Math.floor(a*8);for(let l=0;l<o;l+=1){const c=Ch(this._simTime*1.7+l*13.7),h=Math.floor(c*i.rows)*e.cellHeight,d=(Ch(this._simTime*2.9+l*5.1)-.5)*8*e.cellWidth;e.drawRect(d,h,n,e.cellHeight*.6,`rgba(154,215,255,${a*.16})`)}}}_centeredLine(e,t,i,n){const s=e.measureString(t),a=Math.max(0,(e.viewportWidth-s.width)/2),o=e.viewportHeight*Qa(i);e.drawString(a,o,t,n)}_renderPauseOverlay(e){e.drawRect(0,0,e.viewportWidth,e.viewportHeight,"rgba(0,0,0,0.5)"),this._centeredLine(e,"PAUSED",.42,"#ffe9c4"),this._centeredLine(e,"[ ESC ] resume",.52,"#d7e3ee")}_renderGameOverOverlay(e){e.drawRect(0,0,e.viewportWidth,e.viewportHeight,"rgba(0,0,0,0.6)"),this._centeredLine(e,"THE THREAD SNAPS",.4,"#ff5a5a"),this._centeredLine(e,"[ SPACE ] return",.52,"#d7e3ee")}_measureDisplay(){const e=this._canvas.getBoundingClientRect(),t=Math.max(1,Math.floor(e.width)),i=Math.max(1,Math.floor(e.height)),n=this._canvas.width>0&&e.width>0?this._canvas.width/e.width:typeof window<"u"?window.devicePixelRatio:1;return{cssWidth:t,cssHeight:i,dpr:n}}handleResize(e=this._measureDisplay()){return this._renderer.handleResize(e),this._camera.setViewport(e.cssWidth,e.cssHeight),this._camera.setCellMetrics(this._renderer.cellWidth,this._renderer.cellHeight),this._weather.setCellMetrics(this._renderer.cellWidth,this._renderer.cellHeight),this._loadingScreen.handleResize(e),this._gl&&(this._gl.handleResize(e),this._gl.setCellMetrics(this._renderer.cellWidth,this._renderer.cellHeight)),this._renderer.invalidate(),this}on(e,t){if(typeof e!="string"||typeof t!="function")throw new TypeError("[Game] on() requires a type and listener.");let i=this._listeners.get(e);return i||(i=new Set,this._listeners.set(e,i)),i.add(t),()=>this.off(e,t)}off(e,t){const i=this._listeners.get(e);return i&&(i.delete(t),i.size===0&&this._listeners.delete(e)),this}emit(e,t){const i=this._listeners.get(e);if(i)for(const n of i)try{n(t)}catch(s){console.error(`[Game] '${e}' listener failed:`,s)}}getMetrics(){return{state:this._state,simTime:this._simTime,world:this._worlds.getActiveWorldId(),transitioning:this._worlds.isTransitioning(),zoom:this._camera.zoom,presenter:this._gl?"webgl":"canvas2d",gl:this._gl?this._gl.getMetrics():null,loop:this._loop.getMetrics(),renderer:this._renderer.getStats(),weather:this._weather.getMetrics(),audio:this._audio.getMetrics(),hud:this._hud.getMetrics(),dialogue:this._dialogue.getMetrics(),npcCount:this._interactableNPCs.size,activeNPC:this._activeNPC?this._activeNPC.id??null:null}}}const Yr=1,$r=16384,Rh=1048576,Nv=".",Fv=32,Ph=new Set(["PLAYER","NPC","ENEMY","PORTAL"]),Ov=Object.freeze({" ":Object.freeze({name:"Void",isWalkable:!1,isTransparent:!0,renderColor:"#000000",backgroundHighlight:null,interactionId:null}),".":Object.freeze({name:"Verdant Grass",isWalkable:!0,isTransparent:!0,renderColor:"#4e8d4e",backgroundHighlight:"#070d07",interactionId:null}),",":Object.freeze({name:"Dirt Path",isWalkable:!0,isTransparent:!0,renderColor:"#b3a077",backgroundHighlight:"#0d0b08",interactionId:null}),"~":Object.freeze({name:"Water",isWalkable:!1,isTransparent:!0,renderColor:"#4fc3ff",backgroundHighlight:"#071624",interactionId:null}),"^":Object.freeze({name:"Spike Hazard",isWalkable:!0,isTransparent:!0,renderColor:"#ff4d4d",backgroundHighlight:null,interactionId:"HAZARD_SPIKES"}),"+":Object.freeze({name:"Timber Door",isWalkable:!1,isTransparent:!1,renderColor:"#a06a34",backgroundHighlight:"#16100a",interactionId:"DOOR"}),"*":Object.freeze({name:"Dream Blossom",isWalkable:!0,isTransparent:!0,renderColor:"#ff8ac2",backgroundHighlight:"#070d07",interactionId:null}),C:Object.freeze({name:"Locked Chest",isWalkable:!1,isTransparent:!0,renderColor:"#ffc832",backgroundHighlight:null,interactionId:"CHEST"}),P:Object.freeze({name:"Player Spawn",isWalkable:!0,isTransparent:!0,renderColor:"#ffffff",backgroundHighlight:null,interactionId:null,spawnType:"PLAYER",baseGlyph:"."}),N:Object.freeze({name:"NPC Spawn",isWalkable:!0,isTransparent:!0,renderColor:"#66ccff",backgroundHighlight:null,interactionId:null,spawnType:"NPC",baseGlyph:"."}),E:Object.freeze({name:"Enemy Spawn",isWalkable:!0,isTransparent:!0,renderColor:"#ff3355",backgroundHighlight:null,interactionId:null,spawnType:"ENEMY",baseGlyph:"."}),O:Object.freeze({name:"Dream Portal",isWalkable:!0,isTransparent:!0,renderColor:"#ff7700",backgroundHighlight:null,interactionId:"PORTAL",spawnType:"PORTAL",baseGlyph:"."})});function Ih(r,e,t){if(!Number.isInteger(r)||r<Yr||r>$r)throw new RangeError(`[MapParser] map "${t}" ${e} must be an integer between ${Yr} and ${$r}; received ${r}.`)}function Uv(r){return`U+${r.toString(16).toUpperCase().padStart(4,"0")}`}function Dh(r){if(r===null||typeof r!="object"||Array.isArray(r))throw new TypeError("[MapParser] tileDefinitions must be a plain object.");const e=new Map,t=[];for(const[i,n]of Object.entries(r)){if(typeof i!="string"||Array.from(i).length!==1)throw new TypeError(`[MapParser] tile key must be exactly one glyph; received ${JSON.stringify(i)}.`);if(n===null||typeof n!="object")throw new TypeError(`[MapParser] definition for glyph '${i}' must be an object.`);const s=i.codePointAt(0);if(e.has(s))throw new TypeError(`[MapParser] duplicate tile definition for '${i}'.`);if(typeof n.isWalkable!="boolean")throw new TypeError(`[MapParser] tile '${i}'.isWalkable must be a boolean.`);if(typeof n.isTransparent!="boolean")throw new TypeError(`[MapParser] tile '${i}'.isTransparent must be a boolean.`);if(n.interactionId!==null&&n.interactionId!==void 0&&(typeof n.interactionId!="string"||n.interactionId.length===0))throw new TypeError(`[MapParser] tile '${i}'.interactionId must be null or a non-empty string.`);const a=n.spawnType??null;if(a!==null&&!Ph.has(a))throw new TypeError(`[MapParser] tile '${i}'.spawnType must be one of ${[...Ph].join(", ")}; received ${a}.`);if(a!==null&&(typeof n.baseGlyph!="string"||Array.from(n.baseGlyph).length!==1))throw new TypeError(`[MapParser] spawn tile '${i}' must declare a single-character baseGlyph.`);const o={id:t.length,char:i,codePoint:s,name:typeof n.name=="string"&&n.name.length>0?n.name:i,isWalkable:n.isWalkable,isTransparent:n.isTransparent,renderColor:Z.packColor(n.renderColor??null,4294967295),backgroundHighlight:Z.packColor(n.backgroundHighlight??null,0),interactionId:n.interactionId??null,spawnType:a,baseGlyph:a!==null?n.baseGlyph:null,baseEntry:null};e.set(s,o),t.push(o)}if(t.length===0)throw new TypeError("[MapParser] tileDefinitions must contain at least one glyph.");if(t.length>65535)throw new RangeError("[MapParser] tile registry exceeds 65535 entries (Uint16 tileId limit).");for(const i of t){if(i.spawnType===null)continue;const n=i.baseGlyph.codePointAt(0),s=e.get(n);if(!s)throw new TypeError(`[MapParser] spawn tile '${i.char}' references unknown base glyph '${i.baseGlyph}'.`);if(s.spawnType!==null)throw new TypeError(`[MapParser] spawn tile '${i.char}' may not use another spawn token ('${s.char}') as its base.`);i.baseEntry=s}for(let i=0;i<t.length;i+=1)t[i]=Object.freeze(t[i]);return Object.freeze({byCode:e,list:Object.freeze(t)})}class Qt extends Error{constructor(e,t={}){super(e),this.name="MapParseError",this.mapName=typeof t.mapName=="string"?t.mapName:"unknown",this.line=Number.isInteger(t.line)?t.line:-1,this.column=Number.isInteger(t.column)?t.column:-1,this.cause=t.cause instanceof Error?t.cause:null}}class Qu{constructor(e){if(e===null||typeof e!="object")throw new TypeError("[GameMap] spec must be an object.");const{name:t,cols:i,rows:n,glyphs:s,tileIds:a,registry:o,spawns:l,warnings:c,meta:h}=e;if(typeof t!="string"||t.length===0)throw new TypeError("[GameMap] name must be a non-empty string.");if(!Number.isInteger(i)||i<Yr)throw new RangeError("[GameMap] cols must be a positive integer.");if(!Number.isInteger(n)||n<Yr)throw new RangeError("[GameMap] rows must be a positive integer.");const d=i*n;if(!(s instanceof Uint32Array)||s.length!==d)throw new TypeError("[GameMap] glyphs must be a Uint32Array of cols×rows length.");if(!(a instanceof Uint16Array)||a.length!==d)throw new TypeError("[GameMap] tileIds must be a Uint16Array of cols×rows length.");if(!o||!(o.byCode instanceof Map)||!Array.isArray(o.list))throw new TypeError("[GameMap] registry must expose byCode (Map) and list (Array).");this._name=t,this._cols=i,this._rows=n,this._cellCount=d,this._glyphs=new Uint32Array(s),this._tileIds=new Uint16Array(a),this._registry=o,this._spawns=Object.freeze((Array.isArray(l)?l:[]).map(u=>Object.freeze({...u}))),this._warnings=Object.freeze(Array.isArray(c)?[...c]:[]),this._meta=h&&typeof h=="object"?Object.freeze({...h}):null}get name(){return this._name}get cols(){return this._cols}get rows(){return this._rows}get cellCount(){return this._cellCount}get tiles(){return this._registry.list}get spawns(){return this._spawns}get warnings(){return this._warnings}get meta(){return this._meta}get hasPlayerSpawn(){return this._spawns.some(e=>e.type==="PLAYER")}cellIndex(e,t){return t*this._cols+e}isInBounds(e,t){return Number.isInteger(e)&&Number.isInteger(t)&&e>=0&&t>=0&&e<this._cols&&t<this._rows}getTileIdAt(e,t){return this.isInBounds(e,t)?this._tileIds[this.cellIndex(e,t)]:-1}getGlyphCodeAt(e,t){return this.isInBounds(e,t)?this._glyphs[this.cellIndex(e,t)]:-1}getGlyphAt(e,t){const i=this.getGlyphCodeAt(e,t);return i<0?null:String.fromCodePoint(i)}getTileAt(e,t){const i=this.getTileIdAt(e,t);if(i<0)return null;const n=this._registry.list[i];return{x:e,y:t,char:n.char,codePoint:this._glyphs[this.cellIndex(e,t)],tile:n}}isWalkableAt(e,t){const i=this.getTileIdAt(e,t);return i>=0&&this._registry.list[i].isWalkable}isTransparentAt(e,t){const i=this.getTileIdAt(e,t);return i>=0&&this._registry.list[i].isTransparent}getInteractionIdAt(e,t){const i=this.getTileIdAt(e,t);return i>=0?this._registry.list[i].interactionId:null}getSpawnsByType(e){return this._spawns.filter(t=>t.type===e)}getFirstSpawn(e){return this._spawns.find(t=>t.type===e)??null}getPlayerSpawn(){const e=this.getFirstSpawn("PLAYER");return e?{x:e.x,y:e.y,fromSpawn:!0}:{x:Math.floor(this._cols/2),y:Math.floor(this._rows/2),fromSpawn:!1}}findInteractionCells(e){if(typeof e!="string"||e.length===0)return[];const t=[];for(let i=0;i<this._cellCount;i+=1){const n=this._registry.list[this._tileIds[i]];n.interactionId===e&&t.push({x:i%this._cols,y:i/this._cols|0,tile:n})}return t}forEachCell(e){if(typeof e!="function")throw new TypeError("[GameMap] forEachCell requires a function.");for(let t=0,i=0;t<this._rows;t+=1)for(let n=0;n<this._cols;n+=1,i+=1)e(n,t,this._glyphs[i],this._registry.list[this._tileIds[i]],i);return this}stampInto(e,t=0,i=0){if(!(e instanceof Z))throw new TypeError("[GameMap] stampInto requires an ASCIIBuffer.");const n=Math.trunc(t),s=Math.trunc(i);let a=0;for(let o=0,l=0;o<this._rows;o+=1){const c=o+s;for(let h=0;h<this._cols;h+=1,l+=1){const d=h+n;if(d<0||d>=e.cols||c<0||c>=e.rows)continue;const u=this._registry.list[this._tileIds[l]],f=this._glyphs[l];f===Fv&&!(u.backgroundHighlight&255)||(e.setChar(d,c,f,u.renderColor,u.backgroundHighlight),a+=1)}}return a}createASCIIBuffer(){const e=new Z({cols:this._cols,rows:this._rows,defaultChar:" ",defaultFg:"#e0e0e0",defaultBg:"#000000"});return this.stampInto(e,0,0),e}toText(){const e=[];for(let t=0;t<this._rows;t+=1){let i="";const n=t*this._cols;for(let s=0;s<this._cols;s+=1)i+=String.fromCodePoint(this._glyphs[n+s]);e.push(i)}return e.join(`
`)}}class ea{constructor(e={}){if(e===null||typeof e!="object")throw new TypeError("[MapParser] options must be an object.");this._rawDefinitions={...e.tileDefinitions??Ov},this._registry=Dh(this._rawDefinitions),this._strict=e.strict===void 0?!0:!!e.strict,this._defaultName=typeof e.defaultName=="string"&&e.defaultName.length>0?e.defaultName:"unnamed";const t=e.fallbackGlyph??Nv;this._fallbackEntry=this._resolveFallbackEntry(t)}get registry(){return this._registry}get strict(){return this._strict}get fallbackGlyph(){return this._fallbackEntry.char}hasGlyph(e){return typeof e=="string"&&e.length>0&&this._registry.byCode.has(e.codePointAt(0))}registerTiles(e){if(e===null||typeof e!="object")throw new TypeError("[MapParser] registerTiles requires an object.");return this._rawDefinitions={...this._rawDefinitions,...e},this._registry=Dh(this._rawDefinitions),this._fallbackEntry=this._resolveFallbackEntry(this._fallbackEntry.char),this}_resolveFallbackEntry(e){if(typeof e!="string"||Array.from(e).length!==1)throw new TypeError("[MapParser] fallbackGlyph must be a single character.");const t=this._registry.byCode.get(e.codePointAt(0));if(!t)throw new TypeError(`[MapParser] fallbackGlyph '${e}' does not exist in the tile registry.`);if(t.spawnType!==null)throw new TypeError(`[MapParser] fallbackGlyph '${e}' must not be a spawn token.`);return t}parse(e,t={}){if(typeof e=="string"){if((t.format??(e.trimStart().startsWith("{")?"json":"text"))==="json")try{return this.parseJSON(e,t)}catch(n){if(t.format==="json")throw n}return this.parseText(e,t)}if(Array.isArray(e))return this.parseLines(e,t);if(e!==null&&typeof e=="object")return this.parseJSON(e,t);throw new TypeError("[MapParser] parse() expects a string, string[], or JSON object.")}parseText(e,t={}){if(typeof e!="string")throw new TypeError("[MapParser] parseText requires a string.");return this._buildMap(e.split(/\r?\n/),t)}parseLines(e,t={}){if(!Array.isArray(e))throw new TypeError("[MapParser] parseLines requires an array of strings.");return this._buildMap(e,t)}parseJSON(e,t={}){const i=this._resolveName(t);let n=e;if(typeof e=="string")try{n=JSON.parse(e)}catch(a){throw new Qt(`[MapParser] map "${i}": malformed JSON document: ${a.message}`,{mapName:i,cause:a})}if(n===null||typeof n!="object"||Array.isArray(n))throw new Qt(`[MapParser] map "${i}": JSON root must be an object.`,{mapName:i});let s=null;if(Array.isArray(n.rows)?s=n.rows:Array.isArray(n.grid)?s=n.grid:typeof n.tiles=="string"&&(s=n.tiles.includes(`
`)?n.tiles.split(/\r?\n/):this._chunkFlatTiles(n,i)),s===null)throw new Qt(`[MapParser] map "${i}": JSON must contain "rows", "grid", or "tiles".`,{mapName:i});if(Number.isInteger(n.width)&&s.length>0&&s.map(l=>String(l??"")).find(l=>Array.from(l).length!==n.width)!==void 0)throw new Qt(`[MapParser] map "${i}": row content disagrees with declared width ${n.width}.`,{mapName:i});if(Number.isInteger(n.height)&&s.length!==n.height)throw new Qt(`[MapParser] map "${i}": declared height ${n.height} but found ${s.length} rows.`,{mapName:i});return this._buildMap(s,{...t,name:typeof n.name=="string"&&n.name.length>0?n.name:i,meta:n.meta??null})}_chunkFlatTiles(e,t){const i=e.width,n=e.height;if(!Number.isInteger(i)||i<=0||!Number.isInteger(n)||n<=0)throw new Qt(`[MapParser] map "${t}": flat "tiles" strings require integer width and height.`,{mapName:t});const s=Array.from(String(e.tiles));if(s.length!==i*n)throw new Qt(`[MapParser] map "${t}": flat tiles contain ${s.length} cells; expected ${i*n} (width ${i} × height ${n}).`,{mapName:t});const a=[];for(let o=0;o<n;o+=1)a.push(s.slice(o*i,(o+1)*i).join(""));return a}_resolveName(e){return typeof e.name=="string"&&e.name.length>0?e.name:this._defaultName}_buildMap(e,t={}){if(!Array.isArray(e))throw new TypeError("[MapParser] row source must be an array.");const i=this._resolveName(t),n=t.strict===void 0?this._strict:!!t.strict,s=t.fallbackGlyph===void 0?this._fallbackEntry:this._resolveFallbackEntry(t.fallbackGlyph),a=e.map(p=>p==null?"":String(p));for(;a.length>0&&a[a.length-1].length===0;)a.pop();if(a.length===0)throw new Qt(`[MapParser] map "${i}" contains no rows.`,{mapName:i});const o=a.map(p=>Array.from(p)),l=[];let c;if(n){if(c=o[0].length,c===0)throw new Qt(`[MapParser] map "${i}": first row is empty.`,{mapName:i,line:0});for(let p=1;p<o.length;p+=1)if(o[p].length!==c)throw new Qt(`[MapParser] map "${i}": row ${p} is ${o[p].length} cells wide; expected ${c} (ragged map).`,{mapName:i,line:p,column:Math.min(o[p].length,c)})}else{c=0;for(const p of o)c=Math.max(c,p.length);if(c===0)throw new Qt(`[MapParser] map "${i}" contains only empty rows.`,{mapName:i});for(let p=0;p<o.length;p+=1)o[p].length!==c&&l.push(`row ${p} normalized from ${o[p].length} to ${c} cells using '${s.char}'`)}const h=o.length;Ih(c,"width",i),Ih(h,"height",i);const d=c*h;if(d>Rh)throw new RangeError(`[MapParser] map "${i}" has ${d} cells; maximum supported is ${Rh}.`);const u=new Uint32Array(d),f=new Uint16Array(d),m=[],y=this._registry.byCode;for(let p=0;p<h;p+=1){const _=o[p],T=p*c;for(let A=0;A<c;A+=1){const S=A<_.length?_[A]:s.char;let M=y.get(S.codePointAt(0));if(!M){if(n)throw new Qt(`[MapParser] map "${i}": unknown glyph '${S}' (${Uv(S.codePointAt(0))}) at row ${p}, column ${A}.`,{mapName:i,line:p,column:A});l.push(`unknown glyph '${S}' at (${A}, ${p}) replaced with '${s.char}'`),M=s}const E=T+A;M.spawnType!==null?(m.push({type:M.spawnType,x:A,y:p,glyph:M.char,interactionId:M.interactionId,index:m.length}),u[E]=M.baseEntry.codePoint,f[E]=M.baseEntry.id):(u[E]=M.codePoint,f[E]=M.id)}}return m.some(p=>p.type==="PLAYER")||l.push("map defines no PLAYER spawn; use a saved position or the center fallback."),new Qu({name:i,cols:c,rows:h,glyphs:u,tileIds:f,registry:this._registry,spawns:m,warnings:l,meta:t.meta??null})}static createFallbackMap(e=32,t=16,i={}){const n=Math.trunc(e),s=Math.trunc(t);if(!Number.isInteger(n)||n<4||n>$r)throw new RangeError("[MapParser] fallback width must be an integer ≥ 4.");if(!Number.isInteger(s)||s<4||s>$r)throw new RangeError("[MapParser] fallback height must be an integer ≥ 4.");const a=Math.floor(n/2),o=Math.floor(s/2),l=[];for(let h=0;h<s;h+=1){let d="";for(let u=0;u<n;u+=1)h===0||h===s-1||u===0||u===n-1?d+="#":u===a&&h===o?d+="P":d+=".";l.push(d)}return new ea({tileDefinitions:i.tileDefinitions,defaultName:"fallback"}).parseLines(l,{name:"fallback",strict:!1})}}const ed=Object.freeze({T:Object.freeze({name:"Grove Tree",isWalkable:!1,isTransparent:!1,renderColor:"#3e8e46",backgroundHighlight:"#0a1a0c",interactionId:null}),M:Object.freeze({name:"Mossy Rock",isWalkable:!1,isTransparent:!1,renderColor:"#8a8f7a",backgroundHighlight:"#101208",interactionId:null}),"#":Object.freeze({name:"Concrete Wall",isWalkable:!1,isTransparent:!1,renderColor:"#9aa3ad",backgroundHighlight:"#14161a",interactionId:null}),J:Object.freeze({name:"Orange Juice Cart",isWalkable:!1,isTransparent:!0,renderColor:"#ff7700",backgroundHighlight:"#241505",interactionId:"JUICE_CART"})}),ns=Object.freeze({SOFT:"SOFT",HARD:"HARD",HOLLOW:"HOLLOW"});function kv(r){switch(r){case"Verdant Grass":case"Dream Blossom":case"Dirt Path":case"Player Spawn":case"NPC Spawn":case"Enemy Spawn":case"Dream Portal":return ns.SOFT;case"Void":case"Water":return ns.HOLLOW;default:return ns.HARD}}function Bv(r){let e=r>>>0;return function(){e|=0,e=e+1831565813|0;let i=Math.imul(e^e>>>15,1|e);return i=i+Math.imul(i^i>>>7,61|i)^i,((i^i>>>14)>>>0)/4294967296}}function td(r){const e=[],t={};if(!(r instanceof Qu))return{ok:!1,violations:["not a GameMap instance"],spawnTypes:t};(!Number.isInteger(r.cols)||r.cols<=0||!Number.isInteger(r.rows)||r.rows<=0)&&e.push(`degenerate dimensions ${r.cols}x${r.rows}`);const i=r.cols*r.rows;i!==r.cellCount&&e.push(`cellCount ${r.cellCount} != cols*rows ${i}`);let n=0;r.forEachCell((l,c,h,d)=>{d||(n+=1),(h<0||h>1114111)&&e.push(`invalid code point ${h} at (${l},${c})`)}),n>0&&e.push(`${n} cells reference missing registry tiles`);const s=new Set;let a=0;for(const l of r.spawns){t[l.type]=(t[l.type]??0)+1,(l.x<0||l.y<0||l.x>=r.cols||l.y>=r.rows)&&e.push(`spawn ${l.type} out of bounds at (${l.x},${l.y})`);const c=`${l.x},${l.y}`;s.has(c)&&e.push(`duplicate spawn at (${l.x},${l.y})`),s.add(c),l.type==="PLAYER"&&(a+=1)}a===0&&e.push("no PLAYER spawn present");const o=r.getPlayerSpawn();return o&&([[o.x-1,o.y],[o.x+1,o.y],[o.x,o.y-1],[o.x,o.y+1]].some(([h,d])=>r.isInBounds(h,d)&&r.isWalkableAt(h,d))||e.push("PLAYER spawn is fully enclosed by solid tiles")),{ok:e.length===0,violations:e,spawnTypes:t}}const Hv=72,Gv=32;function zv(r,e={}){const t=Number.isInteger(e.cols)&&e.cols>=24?e.cols:Hv,i=Number.isInteger(e.rows)&&e.rows>=16?e.rows:Gv,n=Bv(Number.isInteger(e.seed)?e.seed:1337),s=r!=="DRAB",a=Array.from({length:i},()=>new Array(t).fill(s?".":"#")),o=(u,f,m)=>{u>=0&&f>=0&&u<t&&f<i&&(a[f][u]=m)};if(s){for(let p=0;p<t;p+=1)o(p,0,"T"),o(p,i-1,"T");for(let p=0;p<i;p+=1)o(0,p,"T"),o(t-1,"T");const u=Math.floor(t*.55),f=Math.floor(i*.55);for(let p=f;p<f+5&&p<i-1;p+=1)for(let _=u;_<u+9&&_<t-1;_+=1)o(_,p,"~");const m=Math.floor(t/2),y=Math.floor(i/2);for(let p=1;p<t-1;p+=1)o(p,y,",");for(let p=1;p<i-1;p+=1)o(m,p,",");for(let p=0;p<Math.floor(t*i*.05);p+=1){const _=1+Math.floor(n()*(t-2)),T=1+Math.floor(n()*(i-2)),A=a[T][_];(A==="."||A===",")&&o(_,T,n()<.5?"T":"*")}o(m,y,"P"),o(m+2,y-1,"N"),o(m-3,y+1,"E")}else{const u=Math.floor(i*.33),f=Math.floor(i*.66);for(let p=1;p<t-1;p+=1)o(p,u,","),o(p,f,",");for(const p of[.25,.5,.75]){const _=Math.floor(t*p);for(let T=1;T<i-1;T+=1)o(_,T,",")}const m=Math.floor(t/2),y=Math.floor(i/2);for(let p=0;p<Math.floor(t*.2);p+=1){const _=2+Math.floor(n()*(t-4)),T=2+Math.floor(n()*(i-4));a[T][_]==="#"&&o(_,T,"+")}o(m+3,f-2,"C"),o(m-4,u+2,"^"),o(m,y,"J"),o(m,y,"P")}const l=new ea({strict:!0});l.registerTiles(ed);const c=a.map(u=>u.join("")),h=l.parseLines(c,{name:`fallback_${s?"grove":"city"}`,strict:!0}),d=td(h);if(!d.ok)throw new Error(`[MapParser_2] Fallback generation produced invalid map: ${d.violations.join("; ")}`);return h}function Wv({sources:r,names:e={},strict:t=!0,allowFallback:i=!0}){const n=new ea({strict:t});n.registerTiles(ed);const s={},a=[],o=[],l=Object.keys(r);for(const c of l){let h=null;try{h=n.parse(r[c],{name:e[c]??`${c}_map`,strict:t})}catch(d){a.push(`[${c}] parse failed: ${d.message}`)}if(h){const d=td(h);d.ok||(a.push(`[${c}] ${d.violations.join("; ")}`),h=null)}if(!h){if(!i)throw new Qt(`[MapParser_2] ${c} failed and fallbacks are disabled`,{worldId:c});h=zv(c,{seed:Vv(c)}),o.push(c),a.push(`[${c}] using deterministic fallback map`)}s[c]=h}return{maps:s,warnings:a,usedFallback:o}}function Vv(r){let e=2166136261;for(let t=0;t<r.length;t+=1)e^=r.charCodeAt(t),e=Math.imul(e,16777619);return e>>>0}const Xv=32,Lh=.55,Nh=2.2,Fh=1.4,eo=16,qv=.85,Yv=.06,$v=.1,Kv="#1b4a6b",jv=.5,Jv="#06182e",Zv=.65,Qv="#071624",eS=Object.freeze(["~"]),tS=2048;function iS(r,e,t,i){return((r&255)<<24|(e&255)<<16|(t&255)<<8|i&255)>>>0}function Oh(r){const e=r>>>0;return{r:e>>>24&255,g:e>>>16&255,b:e>>>8&255,a:e&255}}class nS{constructor(e={}){if(e===null||typeof e!="object")throw new TypeError("[WaterShader] options must be an object.");this.setWave({frequency:e.frequency??Lh,speed:e.speed??Nh,amplitude:e.amplitude??Fh}),this.setSecondaryWave(e.secondaryWave??null),this.setOpacity(e.opacity??qv),this.setDepthFade(e.depthFade??Yv),this._minDepthAlpha=$v,this._waterMask=e.waterMask instanceof Uint8Array?e.waterMask:null,this._reflectBlank=!!e.reflectBlank,this._fgCache=new Map,this._bgCache=new Map,this._fgTintPacked=this._packConfigColor(e.fgTint??Kv),this._bgTintPacked=this._packConfigColor(e.bgTint??Jv),this._waterBgPacked=this._packConfigColor(e.waterBaseColor??Qv),this.setTintStrength(e.fgTintStrength??jv,e.bgTintStrength??Zv),this.setWaterGlyphs(e.waterGlyphs??eS),this._time=0,this._offsetTable=null,this._offsetTableRows=-1,this._offsetTableTime=Number.NaN,this._metrics={framesRendered:0,cellsReflected:0,cacheFlushes:0}}setWave(e){const t=e.frequency??this._frequency??Lh,i=e.speed??this._speed??Nh,n=e.amplitude??this._amplitude??Fh;if(!Number.isFinite(t)||t<0)throw new RangeError("[WaterShader] frequency must be finite and >= 0.");if(!Number.isFinite(i))throw new RangeError("[WaterShader] speed must be finite.");if(!Number.isFinite(n)||n<0||n>eo)throw new RangeError(`[WaterShader] amplitude must be in [0, ${eo}]; received ${n}.`);return this._frequency=t,this._speed=i,this._amplitude=n,this._offsetTableTime=Number.NaN,this}setSecondaryWave(e){if(e==null)return this._secondary=null,this._offsetTableTime=Number.NaN,this;if(!Number.isFinite(e.frequency)||!Number.isFinite(e.speed)||!Number.isFinite(e.amplitude))throw new RangeError("[WaterShader] secondaryWave fields must be finite.");return this._secondary=Object.freeze({frequency:e.frequency,speed:e.speed,amplitude:Math.min(eo,Math.max(0,e.amplitude)),phase:Number.isFinite(e.phase)?e.phase:0}),this._offsetTableTime=Number.NaN,this}setOpacity(e){if(!Number.isFinite(e))throw new RangeError("[WaterShader] opacity must be finite.");return this._opacity=Math.min(1,Math.max(0,e)),this}setDepthFade(e){if(!Number.isFinite(e))throw new RangeError("[WaterShader] depthFade must be finite.");return this._depthFade=Math.min(1,Math.max(0,e)),this}setTintStrength(e,t){if(!Number.isFinite(e)||!Number.isFinite(t))throw new RangeError("[WaterShader] tint strengths must be finite.");return this._fgStrength=Math.min(1,Math.max(0,e)),this._bgStrength=Math.min(1,Math.max(0,t)),this._fgCache.clear(),this._bgCache.clear(),this}setTintColors(e,t,i){return this._fgTintPacked=this._packConfigColor(e),this._bgTintPacked=this._packConfigColor(t),i!==void 0&&(this._waterBgPacked=this._packConfigColor(i)),this._fgCache.clear(),this._bgCache.clear(),this}setWaterGlyphs(e){if(!Array.isArray(e)||e.length===0)throw new TypeError("[WaterShader] waterGlyphs must be a non-empty array.");this._waterCodes=new Set;for(const t of e){if(typeof t!="string"||Array.from(t).length!==1)throw new TypeError("[WaterShader] each water glyph must be one character.");this._waterCodes.add(t.codePointAt(0))}return this}setWaterMask(e){if(e!==null&&!(e instanceof Uint8Array))throw new TypeError("[WaterShader] waterMask must be a Uint8Array or null.");return this._waterMask=e,this}update(e){return!Number.isFinite(e)||e<=0?this:(this._time+=e,this)}setTime(e){if(!Number.isFinite(e))throw new RangeError("[WaterShader] time must be finite.");return this._time=e,this}get time(){return this._time}render(e,t){if(!(e instanceof Z))throw new TypeError("[WaterShader] render requires an ASCIIBuffer.");const i=e.cols,n=e.rows;let s=0,a=0,o=i,l=n;if(t&&typeof t=="object"&&(s=Math.max(0,Math.floor(t.x??0)),a=Math.max(0,Math.floor(t.y??0)),o=Math.min(i,s+Math.ceil(t.width??i-s)),l=Math.min(n,a+Math.ceil(t.height??n-a))),s>=o||a>=l)return 0;this._ensureOffsetTable(n);const c=e.charCodes,h=e.foregroundColors,d=e.backgroundColors,u=this._waterMask&&this._waterMask.length===i*n?this._waterMask:null;let f=0;for(let m=s;m<o;m+=1){let y=a;for(;y<l;){const p=y*i+m;if(!(u?u[p]!==0:this._waterCodes.has(c[p]))){y+=1;continue}const T=y;let A=y;for(;A+1<l;){const S=(A+1)*i+m;if(!(u?u[S]!==0:this._waterCodes.has(c[S])))break;A+=1}for(let S=T;S<=A;S+=1)this._reflectCell(e,c,h,d,u,i,n,m,S,T)&&(f+=1);y=A+1}}return this._metrics.framesRendered+=1,this._metrics.cellsReflected+=f,f}apply(e,t){return this.render(e,t)}_reflectCell(e,t,i,n,s,a,o,l,c,h){const d=2*h-1-c;if(d<0||d>=o)return!1;const u=this._offsetTable[c]|0;let f=l+u;f<0?f=0:f>=a&&(f=a-1);const m=d*a+f,y=t[m];if(s?s[m]!==0:this._waterCodes.has(y))return!1;const _=n[m];if(y===Xv&&(_&255)===0&&!this._reflectBlank)return!1;const A=c-h+1,S=Math.max(this._minDepthAlpha,1-(A-1)*this._depthFade),M=Math.round(255*this._opacity*S)&255,E=i[m],g=this._tintRGB(E,this._fgCache,this._fgTintPacked,this._fgStrength)&4294967040|M;let w;return _&255?w=this._tintRGB(_,this._bgCache,this._bgTintPacked,this._bgStrength)&4294967040|M:w=this._waterBgPacked&4294967040|M,e.setChar(l,c,y,g,w),!0}_ensureOffsetTable(e){const t=this._time;if(this._offsetTable!==null&&this._offsetTableRows===e&&this._offsetTableTime===t)return;(this._offsetTable===null||this._offsetTable.length!==e)&&(this._offsetTable=new Int16Array(e));const i=this._frequency,n=this._speed,s=this._amplitude,a=this._secondary;for(let o=0;o<e;o+=1){let l=Math.sin(o*i+t*n)*s;a!==null&&(l+=Math.sin(o*a.frequency+t*a.speed+a.phase)*a.amplitude),this._offsetTable[o]=Math.round(l)}this._offsetTableRows=e,this._offsetTableTime=t}offsetAt(e){if(!Number.isInteger(e)||e<0)throw new RangeError("[WaterShader] offsetAt requires a non-negative integer row.");return this._ensureOffsetTable(e+1),this._offsetTable[e]|0}_tintRGB(e,t,i,n){const s=t.get(e);if(s!==void 0)return s;const a=Oh(e),o=Oh(i),l=1-n,c=Math.round(a.r*l+o.r*n),h=Math.round(a.g*l+o.g*n),d=Math.round(a.b*l+o.b*n),u=iS(c,h,d,255);return t.size>=tS&&(t.clear(),this._metrics.cacheFlushes+=1),t.set(e,u),u}_packConfigColor(e){return Z.packColor(e,this._waterBgPacked??118891775)}getMetrics(){return{time:this._time,frequency:this._frequency,speed:this._speed,amplitude:this._amplitude,secondaryWave:this._secondary!==null,opacity:this._opacity,depthFade:this._depthFade,waterGlyphs:[...this._waterCodes],hasMask:this._waterMask!==null,framesRendered:this._metrics.framesRendered,cellsReflected:this._metrics.cellsReflected,cacheFlushes:this._metrics.cacheFlushes,fgCacheSize:this._fgCache.size,bgCacheSize:this._bgCache.size}}reset(){return this._time=0,this._fgCache.clear(),this._bgCache.clear(),this._offsetTableTime=Number.NaN,this}destroy(){this._fgCache.clear(),this._bgCache.clear(),this._waterMask=null,this._offsetTable=null}}const sS=20,rS=.22,aS=0,Uh=.2,Sr=Object.freeze({DREAM:"DREAM",DRAB:"DRAB"});class oS{constructor(e={}){if(e===null||typeof e!="object")throw new TypeError("[EnergySystem] options must be an object.");const t=e.maxEnergy??sS;if(!Number.isFinite(t)||t<=0)throw new RangeError(`[EnergySystem] maxEnergy must be positive; received ${t}.`);this._maxEnergy=t;const i=e.initialEnergy??t;if(!Number.isFinite(i)||i<0)throw new RangeError(`[EnergySystem] initialEnergy must be finite and >= 0; received ${i}.`);this._energy=Math.min(i,t);const n=e.dreamPassiveDrain??rS;if(!Number.isFinite(n)||n<0)throw new RangeError("[EnergySystem] dreamPassiveDrain must be finite and >= 0.");const s=e.drabPassiveDrain??aS;if(!Number.isFinite(s)||s<0)throw new RangeError("[EnergySystem] drabPassiveDrain must be finite and >= 0.");this._dreamDrain=n,this._drabDrain=s;const a=e.world??Sr.DREAM;this._validateWorld(a),this._world=a,this._depleted=this._energy<=0,this._low=!this._depleted&&this.fraction<Uh,this._listeners=new Map,this._worldUnsubs=[],this._worlds=null,this._elapsed=0,this._totalSpent=0,this._totalRestored=0}get energy(){return this._energy}get maxEnergy(){return this._maxEnergy}get fraction(){return this._maxEnergy>0?this._energy/this._maxEnergy:0}get oranges(){return this._energy}get maxOranges(){return this._maxEnergy}get isDepleted(){return this._depleted}get world(){return this._world}spend(e){if(!Number.isFinite(e)||e<=0||this._depleted)return 0;const t=Math.min(e,this._energy);return this._energy-=t,this._totalSpent+=t,this._updateLowLatch(),this._energy<=0&&(this._energy=0,this._depleted=!0,this._low=!1,this.emit("depleted",{energy:0,fraction:0,world:this._world,totalSpent:this._totalSpent})),t}restore(e){if(!Number.isFinite(e)||e<=0)return 0;const t=Math.min(e,this._maxEnergy-this._energy);return this._energy+=t,this._totalRestored+=t,t>0&&this._depleted&&(this._depleted=!1,this.emit("restored",{energy:this._energy,fraction:this.fraction,world:this._world,totalRestored:this._totalRestored})),this._updateLowLatch(),t}consumeJuice(){return this.restore(this._maxEnergy-this._energy)}update(e,t=null){if(!Number.isFinite(e)||e<=0)return this;this._elapsed+=e;const i=this._world===Sr.DREAM?this._dreamDrain:this._drabDrain;return i>0&&!this._depleted&&this.spend(i*e),this}attachWorldManager(e){for(const t of this._worldUnsubs)try{t()}catch(i){console.warn("[EnergySystem] world unsubscribe failed:",i)}return this._worldUnsubs=[],this._worlds=e,e&&typeof e.on=="function"&&this._worldUnsubs.push(e.on("worldchanged",t=>{t&&typeof t.to=="string"&&this.setWorld(t.to)})),this}setWorld(e){return this._validateWorld(e),this._world=e,this}addEventListener(e,t){if(typeof e!="string"||typeof t!="function")throw new TypeError("[EnergySystem] listener must be a function.");let i=this._listeners.get(e);return i||(i=new Set,this._listeners.set(e,i)),i.add(t),()=>this.removeEventListener(e,t)}removeEventListener(e,t){const i=this._listeners.get(e);return i&&(i.delete(t),i.size===0&&this._listeners.delete(e)),this}emit(e,t){const i=this._listeners.get(e);if(i)for(const n of i)try{n(t)}catch(s){console.error(`[EnergySystem] '${e}' listener failed:`,s)}}getMetrics(){return{energy:this._energy,maxEnergy:this._maxEnergy,fraction:this.fraction,world:this._world,depleted:this._depleted,dreamDrain:this._dreamDrain,elapsed:this._elapsed,totalSpent:this._totalSpent,totalRestored:this._totalRestored}}destroy(){for(const e of this._worldUnsubs)try{e()}catch(t){console.warn("[EnergySystem] world unsubscribe failed:",t)}this._worldUnsubs=[],this._worlds=null,this._listeners.clear()}_updateLowLatch(){const e=!this._depleted&&this.fraction<Uh;e&&!this._low?(this._low=!0,this.emit("energylow",{fraction:this.fraction})):!e&&this._low?(this._low=!1,this.emit("recovered",{fraction:this.fraction})):this._low=e}_validateWorld(e){if(e!==Sr.DREAM&&e!==Sr.DRAB)throw new RangeError(`[EnergySystem] Unknown world: ${e}.`)}}const Mr=1e-9,to=Math.PI*2,io=65536,lS=4096,cS=8,hS=9.6,uS=20,kh=3772834047,no=0,Bh=4294967295,dS=4291310335,ta=Object.freeze({BELOW_TERRAIN:-100,TERRAIN:0,DECORATION:10,ENTITY:100,PLAYER:200,PROJECTILE:300,EFFECTS:400,UI:1e3}),Ss=Object.freeze({CENTER:"CENTER",BOTTOM_CENTER:"BOTTOM_CENTER",TOP_LEFT:"TOP_LEFT"}),Pi=Object.freeze({ACTIVE:"ACTIVE",EXPIRED:"EXPIRED",DESTROYED:"DESTROYED"});function jn(r,e,t){return r<e?e:r>t?t:r}function Hh(r,e,t){return r+(e-r)*t}function qi(r){return((r+Math.PI)%to+to)%to-Math.PI}function fS(r,e,t){return qi(r+qi(e-r)*t)}function rt(r,e){if(typeof r!="number"||!Number.isFinite(r))throw new RangeError(`[Entity] ${e} must be a finite number; received ${r}.`);return r}function Ms(r,e){if(!r||typeof r!="object")return null;if(typeof r.getBoundsInto=="function")return r.getBoundsInto(e),e;const t=r.bounds;return t&&Number.isFinite(t.x)&&Number.isFinite(t.y)&&Number.isFinite(t.width)&&Number.isFinite(t.height)?(e.x=t.x,e.y=t.y,e.width=t.width,e.height=t.height,e):null}const it={x:0,y:0,width:0,height:0},Qe={x:0,y:0,width:0,height:0},Gh={x:0,y:0},Es={x:0,y:0,width:0,height:0},pS={time:0,normalX:0,normalY:0};let zh=1;class An{constructor(e={}){if(e===null||typeof e!="object")throw new TypeError("[Entity] options must be an object.");if(this._id=zh++,this._name=typeof e.name=="string"?e.name:"entity",this._meta=e.meta&&typeof e.meta=="object"?{...e.meta}:{},this._tags=new Set,e.tags!==void 0){if(!Array.isArray(e.tags))throw new TypeError("[Entity] tags must be an array of strings.");for(const n of e.tags){if(typeof n!="string")throw new TypeError("[Entity] tags must be strings.");this._tags.add(n)}}if(this._x=rt(e.x??0,"x"),this._y=rt(e.y??0,"y"),this._vx=rt(e.vx??0,"vx"),this._vy=rt(e.vy??0,"vy"),this._speed=rt(e.speed??0,"speed"),this._speed<0)throw new RangeError("[Entity] speed must be >= 0.");if(this._maxSpeed=rt(e.maxSpeed??lS,"maxSpeed"),this._maxSpeed<=0)throw new RangeError("[Entity] maxSpeed must be > 0.");if(this._friction=rt(e.friction??0,"friction"),this._friction<0)throw new RangeError("[Entity] friction must be >= 0.");if(this._width=rt(e.width??16,"width"),this._height=rt(e.height??16,"height"),this._width<=0||this._height<=0||this._width>io||this._height>io)throw new RangeError(`[Entity] width/height must be in (0, ${io}]; received ${this._width}×${this._height}.`);const t=e.anchor??Ss.CENTER;if(!Object.values(Ss).includes(t))throw new RangeError(`[Entity] Unknown anchor mode: ${t}.`);if(this._anchor=t,this._angle=qi(rt(e.angle??0,"angle")),this._angularVelocity=rt(e.angularVelocity??0,"angularVelocity"),this._turnRate=rt(e.turnRate??cS,"turnRate"),this._turnRate<0)throw new RangeError("[Entity] turnRate must be >= 0.");this._previousX=this._x,this._previousY=this._y,this._previousAngle=this._angle,this._charCode=this._coerceCharCode(e.char??"@"),this._fgPacked=Z.packColor(e.fgColor??null,kh),this._bgPacked=Z.packColor(e.bgColor??null,no),this._zIndex=rt(e.zIndex??ta.ENTITY,"zIndex"),this._alpha=jn(e.alpha??1,0,1),this._visible=!!(e.visible??!0),this._flashRemaining=0,this._flashDuration=0,this._flashFg=Bh,this._showBounds=!1,this._debugFg=dS,this._appearance={char:this._charCode,fg:this._fgPacked,bg:this._bgPacked,alpha:1},this.setCellMetrics(e.cellWidth??hS,e.cellHeight??uS),this._worldBounds=null,e.worldBounds!==void 0&&e.worldBounds!==null&&this.setWorldBounds(e.worldBounds),this._state=Pi.ACTIVE,this._age=0;const i=e.lifetime??1/0;if(i!==1/0&&(!Number.isFinite(i)||i<=0))throw new RangeError("[Entity] lifetime must be positive or Infinity.");this._lifetime=i,this._listeners=new Map}get id(){return this._id}get name(){return this._name}get meta(){return this._meta}setData(e,t){if(typeof e!="string")throw new TypeError("[Entity] metadata key must be a string.");return this._meta[e]=t,this}getData(e,t=null){return Object.prototype.hasOwnProperty.call(this._meta,e)?this._meta[e]:t}get tags(){return[...this._tags]}addTag(e){return this._tags.add(e),this}removeTag(e){return this._tags.delete(e),this}hasTag(e){return this._tags.has(e)}static resetIdCounter(e=1){if(!Number.isInteger(e)||e<1)throw new RangeError("[Entity] id counter start must be a positive integer.");zh=e}get x(){return this._x}get y(){return this._y}get vx(){return this._vx}get vy(){return this._vy}get speed(){return this._speed}get angle(){return this._angle}get previousX(){return this._previousX}get previousY(){return this._previousY}setPosition(e,t,i=!0){return rt(e,"x"),rt(t,"y"),this._x=e,this._y=t,i&&this.snapInterpolation(),this}teleport(e,t){const i=this._x,n=this._y;return this.setPosition(e,t,!0),this._dispatch("teleport",{x:e,y:t,previousX:i,previousY:n,id:this._id}),this}snapInterpolation(){return this._previousX=this._x,this._previousY=this._y,this._previousAngle=this._angle,this}getRenderPosition(e=1,t=null){const i=Number.isFinite(e)?jn(e,0,1):1,n=t??{x:0,y:0};return n.x=Hh(this._previousX,this._x,i),n.y=Hh(this._previousY,this._y,i),n}getRenderAngle(e=1){const t=Number.isFinite(e)?jn(e,0,1):1;return fS(this._previousAngle,this._angle,t)}setSpeed(e){if(rt(e,"speed"),e<0)throw new RangeError("[Entity] speed must be >= 0.");const t=Math.hypot(this._vx,this._vy);if(this._speed=e,t>Mr){const i=e/t;this._vx*=i,this._vy*=i}else this._vx=0,this._vy=0;return this}setVelocityFromAngle(e,t=this._speed){return rt(e,"angle"),rt(t,"speed"),this._vx=Math.cos(e)*t,this._vy=Math.sin(e)*t,this}applyImpulse(e,t){return rt(e,"impulse x"),rt(t,"impulse y"),this._vx+=e,this._vy+=t,this}stop(){return this._vx=0,this._vy=0,this}moveTowards(e,t,i,n={}){if(rt(e,"targetX"),rt(t,"targetY"),!Number.isFinite(i)||i<=0)return!1;const s=n.arrivalRadius??1,a=e-this._x,o=t-this._y,l=Math.hypot(a,o);if(l<=s)return this.stop(),!0;if(this._speed<=0)return!1;const c=Math.min(this._speed,l/i);this._vx=a/l*c,this._vy=o/l*c;const h=Math.atan2(o,a);return n.instantFacing!==!1?this._angle=qi(h):this.turnTowards(h,i),!1}facePoint(e,t){return this._angle=qi(Math.atan2(t-this._y,e-this._x)),this}turnTowards(e,t,i=this._turnRate){if(!Number.isFinite(t)||t<=0||i<0)return this;const n=qi(e-this._angle),s=i*t;return this._angle=Math.abs(n)<=s?qi(e):qi(this._angle+Math.sign(n)*s),this}get width(){return this._width}get height(){return this._height}get anchor(){return this._anchor}_anchorOffsetX(){return this._anchor===Ss.TOP_LEFT?0:-this._width/2}_anchorOffsetY(){return this._anchor===Ss.TOP_LEFT?0:this._anchor===Ss.BOTTOM_CENTER?-this._height:-this._height/2}get centerX(){return this._x+this._anchorOffsetX()+this._width/2}get centerY(){return this._y+this._anchorOffsetY()+this._height/2}get left(){return this._x+this._anchorOffsetX()}get top(){return this._y+this._anchorOffsetY()}get right(){return this.left+this._width}get bottom(){return this.top+this._height}getBoundsInto(e){return e.x=this._x+this._anchorOffsetX(),e.y=this._y+this._anchorOffsetY(),e.width=this._width,e.height=this._height,e}getBounds(){return{x:this._x+this._anchorOffsetX(),y:this._y+this._anchorOffsetY(),width:this._width,height:this._height}}getRenderBounds(e=1,t=null){const i=this.getRenderPosition(e,Gh),n=t??{x:0,y:0,width:0,height:0};return n.x=i.x+this._anchorOffsetX(),n.y=i.y+this._anchorOffsetY(),n.width=this._width,n.height=this._height,n}setWorldBounds(e){if(e==null)return this._worldBounds=null,this;let t,i,n,s;if(Number.isFinite(e.width)&&Number.isFinite(e.height))t=e.x,i=e.y,n=e.width,s=e.height;else if(Number.isFinite(e.minX)&&Number.isFinite(e.maxX))t=e.minX,i=e.minY,n=e.maxX-e.minX,s=e.maxY-e.minY;else throw new TypeError("[Entity] worldBounds needs x/y/width/height or minX/maxX/minY/maxY.");if(rt(t,"bounds.x"),rt(i,"bounds.y"),rt(n,"bounds.width"),rt(s,"bounds.height"),n<=0||s<=0)throw new RangeError("[Entity] worldBounds dimensions must be positive.");return this._worldBounds=Object.freeze({x:t,y:i,width:n,height:s}),this}get worldBounds(){return this._worldBounds}collidesWith(e){return!e||e===this||(this.getBoundsInto(it),!Ms(e,Qe))?!1:it.x<Qe.x+Qe.width&&it.x+it.width>Qe.x&&it.y<Qe.y+Qe.height&&it.y+it.height>Qe.y}collidesWithBox(e){return!e||!Number.isFinite(e.x)||!Number.isFinite(e.y)||!Number.isFinite(e.width)||!Number.isFinite(e.height)?!1:(this.getBoundsInto(it),it.x<e.x+e.width&&it.x+it.width>e.x&&it.y<e.y+e.height&&it.y+it.height>e.y)}static collides(e,t){return!e||!t||e===t||!Ms(e,it)||!Ms(t,Qe)?!1:it.x<Qe.x+Qe.width&&it.x+it.width>Qe.x&&it.y<Qe.y+Qe.height&&it.y+it.height>Qe.y}distanceTo(e){return Math.sqrt(this.distanceSquaredTo(e))}distanceSquaredTo(e){if(e==null)return 1/0;let t,i;if(Number.isFinite(e.centerX)&&Number.isFinite(e.centerY))t=e.centerX,i=e.centerY;else if(Number.isFinite(e.x)&&Number.isFinite(e.y))t=e.x,i=e.y;else throw new TypeError("[Entity] distance target must be an entity or {x,y} point.");const n=t-this.centerX,s=i-this.centerY;return n*n+s*s}isWithinRange(e,t){return!Number.isFinite(t)||t<0?!1:this.distanceSquaredTo(e)<=t*t}computeSeparation(e){if(!e||e===this||(this.getBoundsInto(it),!Ms(e,Qe)))return null;const t=Math.min(it.x+it.width,Qe.x+Qe.width)-Math.max(it.x,Qe.x),i=Math.min(it.y+it.height,Qe.y+Qe.height)-Math.max(it.y,Qe.y);return t<=0||i<=0?null:t<i?{x:(this.centerX>=Qe.x+Qe.width/2?1:-1)*t,y:0,depth:t,axis:"x"}:{x:0,y:(this.centerY>=Qe.y+Qe.height/2?1:-1)*i,depth:i,axis:"y"}}resolveCollision(e,t=.5){if(!Number.isFinite(t)||t<0||t>1)throw new RangeError("[Entity] resolve share must be in [0, 1].");const i=this.computeSeparation(e);return i?(this.setPosition(this._x+i.x*t,this._y+i.y*t,!0),e&&typeof e.setPosition=="function"&&Number.isFinite(e.x)&&Number.isFinite(e.y)&&e.setPosition(e.x-i.x*(1-t),e.y-i.y*(1-t),!0),!0):!1}sweepsInto(e,t,i=null){if(!e||e===this||!Number.isFinite(t)||t<=0||!Ms(e,Qe))return null;const n=this._anchorOffsetX(),s=this._anchorOffsetY(),a=this._previousX+n,o=this._previousY+s,l=this._vx-(Number.isFinite(e.vx)?e.vx:0),c=this._vy-(Number.isFinite(e.vy)?e.vy:0);return Es.x=Qe.x-this._width,Es.y=Qe.y-this._height,Es.width=Qe.width+this._width,Es.height=Qe.height+this._height,An.segmentIntersectsBox(a,o,a+l*t,o+c*t,Es,i??pS)}static segmentIntersectsBox(e,t,i,n,s,a=null){if(!s||!Number.isFinite(s.x)||!Number.isFinite(s.y)||!Number.isFinite(s.width)||!Number.isFinite(s.height))return null;const o=i-e,l=n-t;let c=-1/0,h=1/0,d=0,u=0;if(Math.abs(o)<Mr){if(e<s.x||e>s.x+s.width)return null}else{let m=(s.x-e)/o,y=(s.x+s.width-e)/o,p=-1;if(m>y){const _=m;m=y,y=_,p=1}m>c&&(c=m,d=p,u=0),h=Math.min(h,y)}if(Math.abs(l)<Mr){if(t<s.y||t>s.y+s.height)return null}else{let m=(s.y-t)/l,y=(s.y+s.height-t)/l,p=-1;if(m>y){const _=m;m=y,y=_,p=1}m>c&&(c=m,d=0,u=p),h=Math.min(h,y)}if(c>h||h<0||c>1)return null;const f=a??{time:0,normalX:0,normalY:0};return c<0?(f.time=0,f.normalX=0,f.normalY=0):(f.time=c,f.normalX=d,f.normalY=u),f}onCollision(e,t=null){this._dispatch("collision",{id:this._id,otherId:(e==null?void 0:e.id)??null,other:e,normalX:(t==null?void 0:t.normalX)??0,normalY:(t==null?void 0:t.normalY)??0,time:(t==null?void 0:t.time)??0})}_coerceCharCode(e){if(typeof e=="number"){if(!Number.isInteger(e)||e<0||e>1114111)throw new RangeError("[Entity] char code point must be in [0, 0x10FFFF].");return e}if(typeof e!="string"||Array.from(e).length!==1)throw new TypeError("[Entity] char must be a single character or code point.");return e.codePointAt(0)}get char(){return String.fromCodePoint(this._charCode)}get glyphCode(){return this._charCode}set char(e){this._charCode=this._coerceCharCode(e)}get fgColor(){return this._fgPacked}set fgColor(e){this._fgPacked=Z.packColor(e,kh)}get bgColor(){return this._bgPacked}set bgColor(e){this._bgPacked=Z.packColor(e,no)}get zIndex(){return this._zIndex}set zIndex(e){this._zIndex=rt(e,"zIndex")}get alpha(){return this._alpha}set alpha(e){this._alpha=jn(rt(e,"alpha"),0,1)}get visible(){return this._visible}set visible(e){this._visible=!!e}setCellMetrics(e,t){if(!Number.isFinite(e)||e<=0)throw new RangeError("[Entity] cellWidth must be positive.");if(!Number.isFinite(t)||t<=0)throw new RangeError("[Entity] cellHeight must be positive.");return this._cellW=e,this._cellH=t,this}flash(e,t="#ffffff"){if(!Number.isFinite(e)||e<0)throw new RangeError("[Entity] flash duration must be >= 0.");return this._flashDuration=e,this._flashRemaining=e,this._flashFg=Z.packColor(t,Bh),this}get flashRemaining(){return this._flashRemaining}get isFlashing(){return this._flashRemaining>0}get showBounds(){return this._showBounds}set showBounds(e){this._showBounds=!!e}get state(){return this._state}get active(){return this._state===Pi.ACTIVE}get destroyed(){return this._state===Pi.DESTROYED}get age(){return this._age}get lifetime(){return this._lifetime}get lifetimeRemaining(){return Math.max(0,this._lifetime-this._age)}expire(){return this._state!==Pi.ACTIVE?!1:(this._state=Pi.EXPIRED,this.stop(),this._dispatch("expire",{id:this._id,age:this._age}),!0)}respawn(e,t){return this._state=Pi.ACTIVE,this._age=0,this._flashRemaining=0,this.stop(),this._angularVelocity=0,this.setPosition(e,t,!0),this._dispatch("respawn",{id:this._id,x:e,y:t}),this}destroy(){return this._state===Pi.DESTROYED?!1:(this._dispatch("destroy",{id:this._id}),this._state=Pi.DESTROYED,this.stop(),this._listeners.clear(),!0)}update(e){if(!Number.isFinite(e)||e<=0)return this;if(this._state!==Pi.ACTIVE)return this;if(this._age+=e,Number.isFinite(this._lifetime)&&this._age>=this._lifetime)return this.expire(),this;this._previousX=this._x,this._previousY=this._y,this._previousAngle=this._angle;const t=Math.exp(-this._friction*e);this._vx*=t,this._vy*=t;const i=this._vx*this._vx+this._vy*this._vy,n=this._maxSpeed;if(i>n*n){const s=n/Math.sqrt(i);this._vx*=s,this._vy*=s}if(this._x+=this._vx*e,this._y+=this._vy*e,this._angle=qi(this._angle+this._angularVelocity*e),this._worldBounds){const s=this._worldBounds,a=this._anchorOffsetX(),o=this._anchorOffsetY();let l=this._x+a,c=this._y+o;const h=s.x,d=s.x+s.width-this._width,u=s.y,f=s.y+s.height-this._height;l<h?(l=h,this._vx<0&&(this._vx=0,this._dispatch("bounds",{id:this._id,axis:"x",side:"min"}))):l>d&&(l=d,this._vx>0&&(this._vx=0,this._dispatch("bounds",{id:this._id,axis:"x",side:"max"}))),c<u?(c=u,this._vy<0&&(this._vy=0,this._dispatch("bounds",{id:this._id,axis:"y",side:"min"}))):c>f&&(c=f,this._vy>0&&(this._vy=0,this._dispatch("bounds",{id:this._id,axis:"y",side:"max"}))),this._x=l-a,this._y=c-o}return this._flashRemaining>0&&(this._flashRemaining=Math.max(0,this._flashRemaining-e)),this}prepareAppearance(e,t){e.char=this._charCode,e.fg=this._flashRemaining>0?this._flashFg:this._fgPacked,e.bg=this._bgPacked,e.alpha=jn(this._alpha*(Number.isFinite(t)?t:1),0,1)}static compositeColor(e,t,i){const n=(e&255)/255*i;if(n<=0)return t>>>0;const s=1-n,a=(t&255)/255,o=n+a*s;if(o<=Mr)return 0;const l=e>>>24&255,c=e>>>16&255,h=e>>>8&255,d=t>>>24&255,u=t>>>16&255,f=t>>>8&255,m=Math.round((l*n+d*a*s)/o),y=Math.round((c*n+u*a*s)/o),p=Math.round((h*n+f*a*s)/o),_=Math.round(o*255);return((m&255)<<24|(y&255)<<16|(p&255)<<8|_&255)>>>0}_writeCell(e,t,i,n,s,a,o){if(t<0||i<0||t>=e.cols||i>=e.rows)return!1;if(o>=1)return e.setChar(t,i,n,s,a),!0;const l=i*e.cols+t,c=An.compositeColor(s,e.foregroundColors[l],o),h=An.compositeColor(a,e.backgroundColors[l],o);return e.setChar(t,i,n,c,h),!0}render(e,t=null,i=1){if(!(e instanceof Z))throw new TypeError("[Entity] render requires an ASCIIBuffer.");if(!this._visible||this._state!==Pi.ACTIVE)return 0;const n=Number.isFinite(i)?jn(i,0,1):1;this.prepareAppearance(this._appearance,n);const s=this._appearance;if(s.alpha<=0)return 0;const a=t&&Number.isFinite(t.x)?t.x:0,o=t&&Number.isFinite(t.y)?t.y:0,l=t&&Number.isFinite(t.cellWidth)&&t.cellWidth>0?t.cellWidth:this._cellW,c=t&&Number.isFinite(t.cellHeight)&&t.cellHeight>0?t.cellHeight:this._cellH;let h=0;this._showBounds&&(h+=this.renderBounds(e,t,n));const d=this.getRenderPosition(n,Gh),u=Math.floor((d.x+this._anchorOffsetX()+this._width/2-a)/l+.5),f=Math.floor((d.y+this._anchorOffsetY()+this._height/2-o)/c+.5);return this._writeCell(e,u,f,s.char,s.fg,s.bg,s.alpha)&&(h+=1),h}renderBounds(e,t=null,i=1){if(!(e instanceof Z))throw new TypeError("[Entity] renderBounds requires an ASCIIBuffer.");const n=t&&Number.isFinite(t.x)?t.x:0,s=t&&Number.isFinite(t.y)?t.y:0,a=t&&Number.isFinite(t.cellWidth)&&t.cellWidth>0?t.cellWidth:this._cellW,o=t&&Number.isFinite(t.cellHeight)&&t.cellHeight>0?t.cellHeight:this._cellH,l=this.getRenderBounds(i,it),c=Math.floor((l.x-n)/a),h=Math.floor((l.y-s)/o),d=Math.floor((l.x+l.width-n)/a),u=Math.floor((l.y+l.height-s)/o);let f=0;const m=[[c,h],[d,h],[c,u],[d,u]];for(let y=0;y<m.length;y+=1)this._writeCell(e,m[y][0],m[y][1],43,this._debugFg,no,1)&&(f+=1);return f}addEventListener(e,t){if(typeof e!="string"||e.length===0)throw new TypeError("[Entity] event type must be a non-empty string.");if(typeof t!="function")throw new TypeError("[Entity] listener must be a function.");let i=this._listeners.get(e);return i||(i=new Set,this._listeners.set(e,i)),i.add(t),this}removeEventListener(e,t){const i=this._listeners.get(e);return i&&(i.delete(t),i.size===0&&this._listeners.delete(e)),this}_dispatch(e,t){const i=this._listeners.get(e);if(i)for(const n of i)try{n(t)}catch(s){console.error(`[Entity #${this._id}] '${e}' listener failed:`,s)}}listenerCount(e){var i;if(e!==void 0)return((i=this._listeners.get(e))==null?void 0:i.size)??0;let t=0;for(const n of this._listeners.values())t+=n.size;return t}getMetrics(){return{id:this._id,name:this._name,state:this._state,x:this._x,y:this._y,vx:this._vx,vy:this._vy,speed:this._speed,angle:this._angle,width:this._width,height:this._height,anchor:this._anchor,zIndex:this._zIndex,alpha:this._alpha,age:this._age,lifetimeRemaining:this.lifetimeRemaining,liveParticles:0,bounds:this.getBounds(),tags:this.tags,listeners:this.listenerCount()}}toString(){return`[Entity #${this._id} '${this._name}' @ (${this._x.toFixed(1)}, ${this._y.toFixed(1)})]`}}const Er=Object.freeze({DREAM:"DREAM",DRAB:"DRAB"}),Xi=Object.freeze({IDLE:"IDLE",WALK:"WALK",SPRINT:"SPRINT",DODGE:"DODGE"}),wr=Object.freeze({IDLE:"idle",WALK:"walk",SPRINT:"sprint",DODGE:"dodge"}),Tr=150,_S=1.7,mS=560,Wh=460,gS=.26,xS=.55,Vh=12,yS=.5,vS=.55,SS=18,MS=.15,ES=.2,wS=6,TS=.4,bS=.35,AS=.6,Xh=2;function Be(r,e,t=null){return Object.freeze({code:r.codePointAt(0),fg:Z.packColor(e),bg:t===null?null:Z.packColor(t)})}const qh="#f4f4f0",br="#c9ced4",Ar="#e5484d",Cr="#3b6fd4",As="#ff7700",Yh="#050505",$h="#17181c",Rr="#33363d",un="#24262b",Kh="#d9d9d4",jh="#101216",CS="#ff7700",Jh="#ffffff",Zh=Object.freeze({DREAM:Object.freeze({frames:Object.freeze([Object.freeze([Object.freeze([Be("(",br),Be("o",qh),Be(")",br)]),Object.freeze([Be("/",Ar),Be("#",Cr),Be("\\",As)]),Object.freeze([Be("#",As),Be("#",Ar),Be("#",Cr)])]),Object.freeze([Object.freeze([Be("(",br),Be("o",qh),Be(")",br)]),Object.freeze([Be("/",Ar),Be("#",Cr),Be("\\",As)]),Object.freeze([Be("#",Cr),Be("#",As),Be("#",Ar)])])])}),DRAB:Object.freeze({frames:Object.freeze([Object.freeze([Object.freeze([Be("(",un),Be("#",Yh,$h),Be(")",un)]),Object.freeze([Be("/",Rr),Be("|",Kh),Be("\\",Rr)]),Object.freeze([Be("#",un),Be("|",jh),Be("#",un)])]),Object.freeze([Object.freeze([Be("(",un),Be("#",Yh,$h),Be(")",un)]),Object.freeze([Be("\\",Rr),Be("|",Kh),Be("/",Rr)]),Object.freeze([Be("#",un),Be("|",jh),Be("#",un)])])])})}),RS={x:0,y:0};class PS extends An{constructor(e={}){if(e===null||typeof e!="object")throw new TypeError("[Player] options must be an object.");const t=e.cellWidth??9.6,i=e.cellHeight??20;super({name:"Player",char:"@",fgColor:As,zIndex:ta.PLAYER,width:t*3,height:i*3,maxSpeed:mS,friction:0,speed:Tr,tags:["player"],...e}),this._input=e.input??null,this._energySystem=null,e.energySystem!==void 0&&e.energySystem!==null&&this.attachEnergySystem(e.energySystem),this._world=Er.DREAM,e.world!==void 0&&this.setWorld(e.world,{silent:!0}),this._moveState=Xi.IDLE,this._controlEnabled=e.controlEnabled!==!1,this._moveDir={x:0,y:0},this._moving=!1,this._walkPhase=0,this._lastStepPhase=0,this._dodgeRemaining=0,this._dodgeCooldown=0,this._sprintLocked=!1,this._sprinting=!1,this._wasLowEnergy=!1}attachInput(e){if(e!==null&&typeof e.isActionDown!="function")throw new TypeError("[Player] input must be an InputManager.");return this._input=e,this}attachEnergySystem(e){if(e===null)return this._energySystem=null,this;if(!Number.isFinite(e.energy)||!Number.isFinite(e.maxEnergy)||e.maxEnergy<=0||typeof e.spend!="function")throw new TypeError("[Player] energySystem must expose numeric energy/maxEnergy and spend(amount).");return this._energySystem=e,this}setControlEnabled(e){return this._controlEnabled=!!e,this}get world(){return this._world}setWorld(e,t={}){if(e!==Er.DREAM&&e!==Er.DRAB)throw new RangeError(`[Player] Unknown world: ${e}.`);if(e===this._world)return this;const i=this._world;return this._world=e,t.silent||(this.flash(.35,Jh),this._dispatch("formchange",{id:this.id,from:i,to:e})),this}setDimension(e){return this.setWorld(e)}_spendEnergy(e){if(!this._energySystem)return e;const t=this._energySystem.spend(e);return Number.isFinite(t)&&t>=0?t:0}get energyFraction(){if(!this._energySystem)return 1;const e=this._energySystem.maxEnergy;return!Number.isFinite(e)||e<=0?1:Math.min(1,Math.max(0,this._energySystem.energy/e))}get oranges(){return this._energySystem?this._energySystem.energy:1/0}get maxOranges(){return this._energySystem?this._energySystem.maxEnergy:1/0}get isExhausted(){return this._sprintLocked}get isDodging(){return this._dodgeRemaining>0}get isInvulnerable(){return this.isDodging}update(e,t=this._input){if(!Number.isFinite(e)||e<=0)return this;if(!this.active)return this;const i=t!=null,n=this._controlEnabled&&i;this._dodgeRemaining>0&&(this._dodgeRemaining=Math.max(0,this._dodgeRemaining-e)),this._dodgeCooldown>0&&(this._dodgeCooldown=Math.max(0,this._dodgeCooldown-e));let s=0,a=0,o=!1;if(n&&!this.isDodging){const u=t.getMovementVector();s=u.x,a=u.y,o=t.isActionDown("SPRINT")}this._moving=s!==0||a!==0,this._moveDir.x=s,this._moveDir.y=a;const l=this.energyFraction;this._sprintLocked&&l>=MS&&(this._sprintLocked=!1),this._sprinting=o&&this._moving&&!this._sprintLocked&&l>0&&!this.isDodging;let c=Tr;if(this._sprinting&&(c=Tr*_S,this._spendEnergy(SS*e),this.energyFraction<=0&&(this._sprinting=!1,this._sprintLocked=!0,c=Tr)),n&&this._dodgeCooldown<=0&&!this.isDodging&&t.isActionJustPressed("DODGE")&&this._beginDodge(),!this.isDodging){const u=s*c,f=a*c,m=1-Math.exp(-14*e);this._vx+=(u-this._vx)*m,this._vy+=(f-this._vy)*m,this._moving&&(this._angle=Math.atan2(a,s))}n&&t.isActionJustPressed("INTERACT")&&this._dispatch("interact",{id:this.id,x:this.x,y:this.y,world:this._world});const h=Math.hypot(this._vx,this._vy);if((this._moving||this.isDodging)&&(this._walkPhase+=h*e/Math.max(1,this._cellH)),this.isDodging?this._moveState=Xi.DODGE:this._sprinting?this._moveState=Xi.SPRINT:this._moving?this._moveState=Xi.WALK:this._moveState=Xi.IDLE,this._moving&&!this.isDodging){const u=Math.floor(this._walkPhase/2);u!==this._lastStepPhase&&(this._lastStepPhase=u,this._dispatch("footstep",{id:this.id,sprint:this._sprinting,world:this._world,x:this._x,y:this._y}))}else this._lastStepPhase=Math.floor(this._walkPhase/2);const d=l<ES;return d&&!this._wasLowEnergy&&this._dispatch("energylow",{id:this.id,fraction:l}),this._wasLowEnergy=d,super.update(e),this}_beginDodge(){const t=this._spendEnergy(Vh)/Vh;let i=this._moveDir.x,n=this._moveDir.y;i===0&&n===0&&(i=Math.cos(this._angle),n=Math.sin(this._angle));const s=Math.hypot(i,n);if(s<=1e-6)return;i/=s,n/=s;let a=1;if(t<yS){if(t<=0){this._dispatch("exhausted",{id:this.id,maneuver:"dodge"});return}a=vS,this._dispatch("exhausted",{id:this.id,maneuver:"dodge-weak"})}this._vx=i*Wh*a,this._vy=n*Wh*a,this._angle=Math.atan2(n,i),this._dodgeRemaining=gS*(a===1?1:.7),this._dodgeCooldown=xS,this._dispatch("dodge",{id:this.id,x:this.x,y:this.y,dirX:i,dirY:n,weakened:a<1})}getAnimationState(){switch(this._moveState){case Xi.WALK:return wr.WALK;case Xi.SPRINT:return wr.SPRINT;case Xi.DODGE:return wr.DODGE;default:return wr.IDLE}}get isSprinting(){return this._sprinting}_pickFrame(){return this._moveState===Xi.IDLE?0:Math.floor(this._walkPhase*2)%2}_computeSpriteAlpha(e){let t=this.alpha;return this.isDodging&&(t*=AS),this._wasLowEnergy&&this.age*wS%1<TS&&(t*=bS),Math.min(1,Math.max(0,t))}_drawStreaks(e,t,i,n){if(!this.isDodging&&!this._sprinting)return 0;const s=Math.hypot(this._vx,this._vy);if(s<1)return 0;const a=this._vx/s,o=this._vy/s,l=Math.abs(a)>=Math.abs(o)?44:39,c=Z.packColor(CS);let h=0;for(let d=1;d<=Xh;d+=1){const u=t-Math.round(a*(d+1)),f=i-Math.round(o*(d+1)),m=n*(1-d/(Xh+1));this._writeCell(e,u,f,l,c,null,m)&&(h+=1)}return h}render(e,t=null,i=1){if(!(e instanceof Z))throw new TypeError("[Player] render requires an ASCIIBuffer.");if(!this.visible||!this.active)return 0;const n=Number.isFinite(i)?Math.min(1,Math.max(0,i)):1,s=this._computeSpriteAlpha(n);if(s<=.02)return 0;const a=t&&Number.isFinite(t.x)?t.x:0,o=t&&Number.isFinite(t.y)?t.y:0,l=t&&Number.isFinite(t.cellWidth)&&t.cellWidth>0?t.cellWidth:this._cellW,c=t&&Number.isFinite(t.cellHeight)&&t.cellHeight>0?t.cellHeight:this._cellH,h=this.getRenderPosition(n,RS),d=Math.floor((h.x-a)/l+.5),u=Math.floor((h.y-o)/c+.5);let f=this._drawStreaks(e,d,u,s);const y=(this._world===Er.DREAM?Zh.DREAM:Zh.DRAB).frames[this._pickFrame()],p=this.isFlashing,_=Z.packColor(Jh);for(let T=0;T<y.length;T+=1){const A=y[T];for(let S=0;S<A.length;S+=1){const M=A[S];if(M===null)continue;const E=p?_:M.fg;this._writeCell(e,d-1+S,u-1+T,M.code,E,M.bg,s)&&(f+=1)}}return f}getNetworkState(){return{id:this.id,x:Math.round(this.x),y:Math.round(this.y),world:this._world,animationState:this.getAnimationState()}}applyServerCorrection(e){if(!e||!Number.isFinite(e.x)||!Number.isFinite(e.y))throw new TypeError("[Player] correction requires finite x and y.");return e.world!==void 0&&e.world!==this._world&&this.setWorld(e.world),this.teleport(e.x,e.y),this}}const Qh=Math.PI*2,Lt=Object.freeze({CLOSED:"CLOSED",TYPING:"TYPING",LINE_READY:"LINE_READY",CHOICES:"CHOICES"}),wn=Object.freeze({LOCKED:"LOCKED",AVAILABLE:"AVAILABLE",ACTIVE:"ACTIVE",READY:"READY",COMPLETED:"COMPLETED"}),_n=Object.freeze({OFFER:"offer",ACCEPT:"accept",COMPLETE:"complete"}),IS=44,DS=1.6,LS=45,NS=.5,eu=.8,FS=1.4,OS=91,US=69,kS=93,BS=33,HS=63,GS=34,so=Z.packColor("#9ad7ff"),zS=Z.packColor("#ffd24a"),WS=Z.packColor("#7dff8a"),VS=Z.packColor("#ff7700"),XS={x:0,y:0},tu=Object.freeze({start:"greeting",nodes:Object.freeze({greeting:Object.freeze({text:Object.freeze(["You walk a frayed hour, traveler.","Mind the loose stitches between the minutes."]),choices:Object.freeze([Object.freeze({label:"What do you mean?",next:"explain"}),Object.freeze({label:"Just passing through.",next:"farewell"})])}),explain:Object.freeze({text:Object.freeze(["Time is quilted here, not woven.","Where a patch comes loose, the stillness leaks through."]),next:"farewell"}),farewell:Object.freeze({text:Object.freeze(["Walk softly. The hour is thin."])})})}),qS=Object.freeze({start:"greeting",startRules:Object.freeze([Object.freeze({node:"tear_ready",condition:r=>r.questStatus("seal_temporal_tear")===wn.READY}),Object.freeze({node:"tear_progress",condition:r=>r.questStatus("seal_temporal_tear")===wn.ACTIVE})]),nodes:Object.freeze({greeting:Object.freeze({text:Object.freeze(["Hold a moment, traveler. The stitches of this hour are loose.","I am Ira, mender of the Loom. You carry a live thread — that is rare."]),flags:Object.freeze([{name:"met_mender_ira",value:!0}]),choices:Object.freeze([Object.freeze({label:"What's wrong with time here?",next:"anomaly_brief"}),Object.freeze({label:"Where can I refill my energy?",next:"juice_hint"}),Object.freeze({label:"Just passing through.",next:"farewell"})])}),anomaly_brief:Object.freeze({text:Object.freeze(["A temporal tear has opened past the grove, where the clockflowers grow.","Left unsealed it spreads a time-stop: a stillness that swallows everything it touches.","Take stitch-thread and close it. The Loom will owe you a patch."]),quest:Object.freeze({op:_n.OFFER,id:"seal_temporal_tear"}),choices:Object.freeze([Object.freeze({label:"I'll seal the tear.",next:"tear_accepted",quest:Object.freeze({op:_n.ACCEPT,id:"seal_temporal_tear"})}),Object.freeze({label:"Not yet.",next:"farewell"})])}),tear_accepted:Object.freeze({text:Object.freeze(["Take this stitch-thread. It remembers the shape of whole hours.","Follow the wilted clockflowers north-east; the tear weeps where they stop blooming."]),flags:Object.freeze([{name:"tear_briefed",value:!0}])}),tear_progress:Object.freeze({text:Object.freeze(["The tear still weeps — I can hear it from here.","North-east, where the clockflowers stop blooming. Stitch it shut."]),choices:Object.freeze([Object.freeze({label:"I'm on my way.",next:"farewell"}),Object.freeze({label:"Where can I refill my energy first?",next:"juice_hint"})])}),tear_ready:Object.freeze({text:Object.freeze(["The thread sings — you sealed it! The hour breathes whole again.","The Loom records your patch, traveler. Few hands can hold time together."]),quest:Object.freeze({op:_n.COMPLETE,id:"seal_temporal_tear"}),choices:Object.freeze([Object.freeze({label:"Anything else needs mending?",next:"juice_hint"}),Object.freeze({label:"Glad to help.",next:"farewell"})])}),juice_hint:Object.freeze({text:Object.freeze(["The Orange Juice Cart parks by the fountain square, east of the Loom.","Its keeper fills a glass for anyone whose thread runs thin.","Fresh orange steadies a fraying reserve better than any charm I can stitch."]),choices:Object.freeze([Object.freeze({label:"My reserve really is running low...",next:"juice_low",condition:r=>r.orangeFraction<.25}),Object.freeze({label:"Thanks. I'll find the cart.",next:"farewell"})])}),juice_low:Object.freeze({text:Object.freeze(["Then go straight to the cart — do not chase tears on a thin thread.","Tell the keeper Ira sent you. The first pour is on the Loom."]),flags:Object.freeze([{name:"juice_cart_referred",value:!0}]),quest:Object.freeze({op:_n.OFFER,id:"juice_cart_delivery"})}),farewell:Object.freeze({text:Object.freeze(["Walk softly. The hour is thinner than it looks."])})})});class Fs extends An{constructor(e={}){if(e===null||typeof e!="object")throw new TypeError("[NPC] options must be an object.");super({name:"NPC",char:"N",fgColor:"#7fd4ff",zIndex:ta.ENTITY,width:12,height:20,friction:8,tags:["npc"],...e});const t=e.interactionRadius??IS;if(!Number.isFinite(t)||t<=0)throw new RangeError("[NPC] interactionRadius must be positive.");this._interactionRadius=t;const i=e.charsPerSecond??LS;if(!Number.isFinite(i)||i<=0)throw new RangeError("[NPC] charsPerSecond must be positive.");this._charsPerSecond=i,this._facePlayer=e.facePlayer!==!1,this._questIds=[],e.quests!==void 0&&this.setQuestIds(e.quests),this._questSystem=null,e.questSystem!==void 0&&e.questSystem!==null&&this.attachQuestSystem(e.questSystem);const n=this._normalizeDialogue(e.dialogue??tu);this._dialogue=n,this._dialogueState=Lt.CLOSED,this._activeNodeId=null,this._lineIndex=0,this._revealedChars=0,this._visibleChoices=[],this._selectedChoice=0,this._dialoguePlayer=null,this._player=e.player??null,this._playerInProximity=!1}attachPlayer(e){if(e!==null&&(!Number.isFinite(e.x)||!Number.isFinite(e.y)))throw new TypeError("[NPC] player must expose numeric x and y.");return this._player=e,this}attachQuestSystem(e){if(e===null)return this._questSystem=null,this;const i=["getQuestStatus","offerQuest","acceptQuest","completeQuest","hasFlag","setFlag"].filter(n=>typeof e[n]!="function");if(i.length>0)throw new TypeError(`[NPC] questSystem is missing required methods: ${i.join(", ")}.`);return this._questSystem=e,this}setQuestIds(e){if(!Array.isArray(e))throw new TypeError("[NPC] quests must be an array of strings.");return this._questIds=e.map(t=>{if(typeof t!="string"||t.length===0)throw new TypeError("[NPC] quest ids must be non-empty strings.");return t}),this}setInteractionRadius(e){if(!Number.isFinite(e)||e<=0)throw new RangeError("[NPC] interactionRadius must be positive.");return this._interactionRadius=e,this}get interactionRadius(){return this._interactionRadius}checkInteractionRange(e){if(!e)return!1;const t=this._interactionRadius*this._interactionRadius;return this.distanceSquaredTo(e)<=t}canInteract(){return this.active&&this.visible&&this._dialogueState===Lt.CLOSED&&this._playerInProximity}get isPlayerInRange(){return this._playerInProximity}getQuestMarker(){if(!this._questSystem||this._questIds.length===0)return null;let e=!1;for(let t=0;t<this._questIds.length;t+=1){const i=this._safeQuestStatus(this._questIds[t]);if(i===wn.READY)return"?";i===wn.AVAILABLE&&(e=!0)}return e?"!":null}_safeQuestStatus(e){try{const t=this._questSystem.getQuestStatus(e);return typeof t=="string"?t:wn.LOCKED}catch(t){return console.error(`[NPC #${this.id}] getQuestStatus('${e}') failed:`,t),wn.LOCKED}}_normalizeDialogue(e){if(e===null||typeof e!="object")throw new TypeError("[NPC] dialogue must be an object.");if(typeof e.start!="string"||e.start.length===0)throw new TypeError("[NPC] dialogue.start must be a node id.");if(e.nodes===null||typeof e.nodes!="object")throw new TypeError("[NPC] dialogue.nodes must be an object.");const t=new Map;for(const[n,s]of Object.entries(e.nodes))t.set(n,this._normalizeNode(n,s));if(t.size===0)throw new TypeError("[NPC] dialogue must contain at least one node.");if(!t.has(e.start))throw new TypeError(`[NPC] dialogue.start '${e.start}' is not a defined node.`);for(const[n,s]of t){if(s.next!==null&&!t.has(s.next))throw new TypeError(`[NPC] node '${n}' transitions to unknown node '${s.next}'.`);for(let a=0;a<s.choices.length;a+=1){const o=s.choices[a];if(o.next!==null&&!t.has(o.next))throw new TypeError(`[NPC] node '${n}' choice ${a} targets unknown node '${o.next}'.`)}}const i=[];if(e.startRules!==void 0){if(!Array.isArray(e.startRules))throw new TypeError("[NPC] dialogue.startRules must be an array.");for(let n=0;n<e.startRules.length;n+=1){const s=e.startRules[n];if(!s||typeof s.node!="string"||!t.has(s.node))throw new TypeError(`[NPC] startRules[${n}].node must reference a defined node.`);if(typeof s.condition!="function")throw new TypeError(`[NPC] startRules[${n}].condition must be a function.`);i.push(Object.freeze({node:s.node,condition:s.condition}))}}return{nodes:t,start:e.start,startRules:Object.freeze(i)}}_normalizeNode(e,t){if(t===null||typeof t!="object")throw new TypeError(`[NPC] node '${e}' must be an object.`);let i=t.text;if(typeof i=="string"&&(i=[i]),!Array.isArray(i)||i.length===0||!i.every(l=>typeof l=="string"&&l.length>0))throw new TypeError(`[NPC] node '${e}' needs non-empty string text lines.`);const n=[];if(t.choices!==void 0){if(!Array.isArray(t.choices))throw new TypeError(`[NPC] node '${e}'.choices must be an array.`);for(let l=0;l<t.choices.length;l+=1)n.push(this._normalizeChoice(e,l,t.choices[l]))}let s=null;if(t.next!==void 0&&t.next!==null){if(typeof t.next!="string")throw new TypeError(`[NPC] node '${e}'.next must be a string or null.`);s=t.next}const a=this._normalizeQuestAction(e,t.quest),o=[];if(t.flags!==void 0){if(!Array.isArray(t.flags))throw new TypeError(`[NPC] node '${e}'.flags must be an array.`);for(const l of t.flags){if(!l||typeof l.name!="string")throw new TypeError(`[NPC] node '${e}'.flags entries need string names.`);o.push(Object.freeze({name:l.name,value:l.value??!0}))}}if(t.onEnter!==void 0&&typeof t.onEnter!="function")throw new TypeError(`[NPC] node '${e}'.onEnter must be a function.`);return Object.freeze({id:e,text:Object.freeze([...i]),choices:Object.freeze(n),next:s,quest:a,flags:Object.freeze(o),onEnter:t.onEnter??null})}_normalizeChoice(e,t,i){const n=`node '${e}' choice ${t}`;if(i===null||typeof i!="object")throw new TypeError(`[NPC] ${n} must be an object.`);if(typeof i.label!="string"||i.label.length===0)throw new TypeError(`[NPC] ${n} needs a non-empty label.`);if(i.condition!==void 0&&typeof i.condition!="function")throw new TypeError(`[NPC] ${n}.condition must be a function.`);let s=null;if(i.next!==void 0&&i.next!==null){if(typeof i.next!="string")throw new TypeError(`[NPC] ${n}.next must be a string or null.`);s=i.next}return Object.freeze({label:i.label,next:s,condition:i.condition??null,quest:this._normalizeQuestAction(n,i.quest)})}_normalizeQuestAction(e,t){if(t==null)return null;const i=Object.values(_n);if(typeof t!="object"||!i.includes(t.op)||typeof t.id!="string"||t.id.length===0)throw new TypeError(`[NPC] ${e} quest must be { op: ${i.join("|")}, id: string }.`);return Object.freeze({op:t.op,id:t.id})}get inDialogue(){return this._dialogueState!==Lt.CLOSED}get dialogueState(){return this._dialogueState}_buildContext(){const e=this._dialoguePlayer??this._player,t=this._questSystem;return{npc:this,player:e,orangeFraction:e&&Number.isFinite(e.energyFraction)?e.energyFraction:1,world:e&&typeof e.world=="string"?e.world:"DREAM",hasFlag:i=>t?t.hasFlag(i):!1,questStatus:i=>t?t.getQuestStatus(i):wn.LOCKED}}_evaluateCondition(e,t){try{return!!e(t)}catch(i){return console.error(`[NPC #${this.id}] dialogue condition failed:`,i),!1}}_resolveStartNode(){const e=this._buildContext();for(let t=0;t<this._dialogue.startRules.length;t+=1){const i=this._dialogue.startRules[t];if(this._evaluateCondition(i.condition,e))return i.node}return this._dialogue.start}beginDialogue(e,t={}){return this.inDialogue||!this.active||!t.force&&(this._player=e??this._player,!this.checkInteractionRange(e))?!1:(this._dialoguePlayer=e??this._player,this._enterNode(this._resolveStartNode()),this._dispatch("dialoguestart",{id:this.id,nodeId:this._activeNodeId}),!0)}_enterNode(e){const t=this._dialogue.nodes.get(e);if(!t)throw new RangeError(`[NPC] Unknown dialogue node: ${e}.`);this._activeNodeId=e,this._lineIndex=0,this._revealedChars=0,this._selectedChoice=0,this._dialogueState=Lt.TYPING;const i=this._buildContext();if(this._questSystem&&t.flags.length>0)for(const n of t.flags)try{this._questSystem.setFlag(n.name,n.value)}catch(s){console.error(`[NPC #${this.id}] setFlag('${n.name}') failed:`,s)}if(t.quest&&this._executeQuestAction(t.quest),t.onEnter)try{t.onEnter(this,i)}catch(n){console.error(`[NPC #${this.id}] onEnter('${e}') failed:`,n)}this._dispatch("nodeenter",{id:this.id,nodeId:e})}_executeQuestAction(e){if(this._questSystem)try{switch(e.op){case _n.OFFER:this._questSystem.offerQuest(e.id);break;case _n.ACCEPT:this._questSystem.acceptQuest(e.id);break;case _n.COMPLETE:this._questSystem.completeQuest(e.id);break;default:break}this._dispatch("questaction",{id:this.id,op:e.op,questId:e.id})}catch(t){console.error(`[NPC #${this.id}] quest ${e.op}('${e.id}') failed:`,t)}}advanceDialogue(){if(!this.inDialogue)return!1;if(this._dialogueState===Lt.TYPING)return this._revealedChars=this._currentLine().length,this._dialogueState=Lt.LINE_READY,!0;if(this._dialogueState===Lt.LINE_READY){const e=this._activeNode();if(this._lineIndex+1<e.text.length)return this._lineIndex+=1,this._revealedChars=0,this._dialogueState=Lt.TYPING,!0;if(e.choices.length>0){const t=this._buildContext();if(this._visibleChoices=e.choices.filter(i=>i.condition===null||this._evaluateCondition(i.condition,t)),this._visibleChoices.length>0)return this._selectedChoice=0,this._dialogueState=Lt.CHOICES,!0}return e.next!==null?this._enterNode(e.next):this.endDialogue("terminal"),!0}return this._dialogueState===Lt.CHOICES?this._confirmChoice():!1}moveChoiceSelection(e){if(this._dialogueState!==Lt.CHOICES)return this;if(this._visibleChoices.length===0)return this;const t=e<0?-1:1,i=this._visibleChoices.length;return this._selectedChoice=((this._selectedChoice+t)%i+i)%i,this}_confirmChoice(){const e=this._visibleChoices[this._selectedChoice];return e?(e.quest&&this._executeQuestAction(e.quest),this._dispatch("choice",{id:this.id,nodeId:this._activeNodeId,label:e.label}),e.next!==null?this._enterNode(e.next):this.endDialogue("terminal"),!0):!1}endDialogue(e="closed"){if(!this.inDialogue)return!1;const t=this._activeNodeId;return this._dialogueState=Lt.CLOSED,this._activeNodeId=null,this._lineIndex=0,this._revealedChars=0,this._visibleChoices=[],this._selectedChoice=0,this._dialoguePlayer=null,this._dispatch("dialogueend",{id:this.id,nodeId:t,reason:e}),!0}_activeNode(){return this._activeNodeId?this._dialogue.nodes.get(this._activeNodeId):null}_currentLine(){const e=this._activeNode();return e?e.text[Math.min(this._lineIndex,e.text.length-1)]:""}handleInput(e){if(!this.inDialogue||!e||typeof e.isActionJustPressed!="function")return!1;if(e.isActionJustPressed("PAUSE"))return this.endDialogue("closed"),!0;if(this._dialogueState===Lt.CHOICES){if(e.isActionJustPressed("MOVE_UP"))return this.moveChoiceSelection(-1),!0;if(e.isActionJustPressed("MOVE_DOWN"))return this.moveChoiceSelection(1),!0}return e.isActionJustPressed("ACTION")?(this.advanceDialogue(),!0):!1}getDialogueView(){if(!this.inDialogue)return{active:!1,state:this._dialogueState,nodeId:null,speaker:this.name,lineIndex:0,lineCount:0,visibleText:"",fullLine:"",lineComplete:!1,choices:[]};const e=this._currentLine(),t=Math.min(e.length,Math.floor(this._revealedChars));return{active:!0,state:this._dialogueState,nodeId:this._activeNodeId,speaker:this.name,lineIndex:this._lineIndex,lineCount:this._activeNode().text.length,visibleText:e.slice(0,t),fullLine:e,lineComplete:this._dialogueState!==Lt.TYPING,choices:this._dialogueState===Lt.CHOICES?this._visibleChoices.map((i,n)=>({label:i.label,selected:n===this._selectedChoice})):[]}}update(e,t=this._player){var n;if(!Number.isFinite(e)||e<=0)return this;if(!this.active)return this;t&&(this._player=t);const i=this.checkInteractionRange(this._player);if(i!==this._playerInProximity&&(this._playerInProximity=i,this._dispatch(i?"rangeenter":"rangeexit",{id:this.id,playerId:((n=this._player)==null?void 0:n.id)??null})),this.inDialogue&&(this._dialogueState===Lt.TYPING&&(this._revealedChars+=this._charsPerSecond*e,this._revealedChars>=this._currentLine().length&&(this._revealedChars=this._currentLine().length,this._dialogueState=Lt.LINE_READY)),this._dialoguePlayer)){const s=this._interactionRadius*DS;this.distanceSquaredTo(this._dialoguePlayer)>s*s&&this.endDialogue("walkedaway")}if(this._facePlayer&&this._playerInProximity&&this._player){const s=Math.atan2(this._player.y-this.y,this._player.x-this.x);this.turnTowards(s,e)}return super.update(e),this}prepareAppearance(e,t){if(super.prepareAppearance(e,t),!this.isFlashing){const i=.5+.5*Math.sin(Qh*NS*this.age),n=eu+(1-eu)*i;e.alpha*=n}}_drawIndicator(e,t,i){let n=0;if(this.inDialogue)return this._writeCell(e,t,i-1,GS,VS,null,1)&&(n+=1),n;if(!this._playerInProximity)return n;const s=i-(Math.sin(Qh*FS*this.age)>0?2:1),a=this.getQuestMarker();return a==="?"?(this._writeCell(e,t,s,HS,WS,null,1)&&(n+=1),n):a==="!"?(this._writeCell(e,t,s,BS,zS,null,1)&&(n+=1),n):(this._writeCell(e,t-1,s,OS,so,null,1)&&(n+=1),this._writeCell(e,t,s,US,so,null,1)&&(n+=1),this._writeCell(e,t+1,s,kS,so,null,1)&&(n+=1),n)}render(e,t=null,i=1){if(!(e instanceof Z))throw new TypeError("[NPC] render requires an ASCIIBuffer.");if(!this.visible||!this.active)return 0;const n=Number.isFinite(i)?Math.min(1,Math.max(0,i)):1,s=t&&Number.isFinite(t.x)?t.x:0,a=t&&Number.isFinite(t.y)?t.y:0,o=t&&Number.isFinite(t.cellWidth)&&t.cellWidth>0?t.cellWidth:this._cellW,l=t&&Number.isFinite(t.cellHeight)&&t.cellHeight>0?t.cellHeight:this._cellH,c=this.getRenderPosition(n,XS),h=Math.floor((c.x-s)/o+.5),d=Math.floor((c.y-a)/l+.5);let u=this._drawIndicator(e,h,d);const f=this._appearance;return this.prepareAppearance(f,n),f.alpha>.02&&this._writeCell(e,h,d,f.char,f.fg,f.bg,f.alpha)&&(u+=1),u}getMetrics(){return{...super.getMetrics(),dialogueState:this._dialogueState,activeNode:this._activeNodeId,playerInRange:this._playerInProximity,questMarker:this.getQuestMarker(),questIds:[...this._questIds],interactionRadius:this._interactionRadius}}destroy(){return this.inDialogue&&this.endDialogue("destroyed"),super.destroy()}static createTemporalMender(e={}){return new Fs({name:"Mender Ira",char:"M",fgColor:"#7fe0d4",dialogue:qS,quests:["seal_temporal_tear","juice_cart_delivery"],interactionRadius:52,tags:["npc","quest-giver","loom"],...e})}static createVillager(e={}){return new Fs({dialogue:tu,...e})}}const YS=`TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
T..............................................................................T
T.MMMMMMMMMMMMMMM..............................................................T
T.M.............M.,,...........................................................T
T.M.C...........M.,,...........................................................T
T.M.........E...M.,,......T....T.......T.......................................T
T.M...E.........M.,,....T.....*.....T....*................................T....T
T.M.............M.,,.........T.....*...........................................T
T.M..........E..M.,,..*..*........T......T.....................................T
T.M.............M.,,....T........T....*.....................................T..T
T.MMMMMMM MMMMMMM.,,........T........T..T......................................T
T.......^,^.......,,...........................................................T
T.................,,..N.............................~~~~~~~~~~~~~~~~~~~~.......T
T.................,,................................~~~~~~~~~~~~~~~~~~~~.......T
T.................,,................................~~~~~~~~~~~~~~~~~~~~.......T
T.................,,................................~~~~~~~~~~~~~~~~~~~~.......T
T.................,,............................,,,,~~~~~~~~~~~~~~~~~~~~.......T
T.................,,............................,,,,~~~~~~~~~~~~~~~~~~~~.......T
T.................P,............................,,,,~~~~~~~~~~~~~~~~~~~~.......T
T.................,,.......T....................,,,,~~~~~~~~~~~~~~~~~~~~.......T
T.................,,..T...............T.............~~~~~~~~~~~~~~~~~~~~.......T
T.................,,............T...............T...~~~~~~~~~~~~~~~~~~~~.......T
T.................,,....T.....*.....*...............~~~~~~~~~~~~~~~~~~~~.......T
T.................,,.........T......................~~~~~~~~~~~~~~~~~~~~.......T
T.................,,...*...........T........T...............................T..T
T.................,,...........................................................T
T.................,,...T.......T..........*....................T....*....T.....T
T.................,,.................T........T......................T.........T
T.................,,.......T.......................*...*....T..................T
T.................,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,.O..........*..............T
T.................,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,..............T............T
T.................,,....................T....................*.................T
T.................,,.........................T................T................T
T.................,,.............C..........E......................T.......T...T
T..............................................................................T
TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
`,$S=`################################################################################
############,,############,,############,,############,,##########,,############
############,,############,,############,,############,,##########,,############
############,,############,,############,,############,,##########,,############
############,,############,,############,,############,,##########,,############
############,,############,,############,,############,,##########,,############
############,,############,,############,,############,,##########,,############
############,,############,,############,,############,,##########,,############
#,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#
#,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#
######,#+###,,##+#########,,##+#########,,###+########,,####,#####,,############
######,#####,,############,,############,,############,,####,#####,,############
######^#####,,############,,############,,############,,####,#####,,############
######^#####,,############,,############,,############,,####,#####,,############
######,#####,,############,,############,,############,,####,#####,,############
######,#####,,############,,############,,##+####+####,,####C#####,,############
######,#####,,############,,############,,##,,,,,,####,,####,#####,,############
######,#####,,#######+####,,########+###,,##,,,,,,+###,,####,#####,,##+#########
#,,,,,,,,,,,,,,,,,P,,,,,,,,,,,,,,,,,,,,,,,,,,,J,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#
#,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#
#########+##,,######,#####,,##+##,######,,##,,,,,,####,,##+#######,,#####+######
############,,######,#####,,#####,######,,##,,,,,,####,,##########,,############
############,,######,#####,,#####,######,,##+####+####,,##########,,############
############,,######,#####,,#####,######,,############,,##########,,############
############,,######,#####,,#####^######,,############,,##########,,############
############,,######C#####,,#####,######,,############,,##########,,############
############,,######,#####,,#####,######,,############,,##########,,############
############,,#+####,#####,,#####,######,,######+#####,,#######+##,,############
#,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#
#,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#
############,,##########+#,,############,,############,,#+########,,##+#########
############,,############,,############,,############,,##########,,############
############,,############,,############,,############,,##########,,############
############,,############,,############,,############,,##########,,############
############,,############,,############,,############,,##########,,############
################################################################################
`,KS=Object.freeze({start:"greeting",nodes:Object.freeze({greeting:Object.freeze({text:Object.freeze(["Hold a moment, traveler. The stitches of this hour are loose.","I am Ira, mender of the Loom. You carry a live thread — rare, these days."]),choices:Object.freeze([Object.freeze({label:"What's wrong with time?",next:"anomaly_brief"}),Object.freeze({label:"How do I keep my energy up?",next:"energy_hint"}),Object.freeze({label:"Just passing through.",next:"farewell"})])}),anomaly_brief:Object.freeze({text:Object.freeze(["Where a patch comes loose, the stillness leaks through.","Mind the lake road east — the reflection there shows what the hour used to be."]),next:"farewell"}),energy_hint:Object.freeze({text:Object.freeze(["Your oranges are the thread that keeps the Dream sewn to you.","Spend them and the world turns gray and drab. Find the Juice Cart","in that gray city, drink deep, and the color comes home."]),next:"farewell"}),farewell:Object.freeze({text:Object.freeze(["Walk softly. The hour is thin."])})})}),jS=Object.freeze({start:"greeting",nodes:Object.freeze({greeting:Object.freeze({text:Object.freeze(["Cold pressed, corner of 4th and Always. One cup on the house —","you look like the color drained right out of you."]),choices:Object.freeze([Object.freeze({label:"[Drink the juice]",next:"served"}),Object.freeze({label:"Maybe later.",next:"farewell"})])}),served:Object.freeze({text:Object.freeze(["There it is. Back to the grove with you — and mind the rain,","it gets in the stitches."]),next:"farewell"}),farewell:Object.freeze({text:Object.freeze(["Cart's here every gray morning."])})})});function JS(r){const{maps:e,warnings:t,usedFallback:i}=Wv({sources:{[He.DREAM]:YS,[He.DRAB]:$S},names:{[He.DREAM]:"dream_grove",[He.DRAB]:"drab_streets"}});for(const g of t)console.warn("[DimensionContent]",g);const n=e[He.DREAM],s=e[He.DRAB],a=r._worlds,o=r._renderer,l=r._input,c=o.cellWidth,h=o.cellHeight,d=a.getActiveWorldId();a.setWorldBuffer(He.DREAM,n.createASCIIBuffer(),{silent:!0}),a.setWorldBuffer(He.DRAB,s.createASCIIBuffer(),{silent:!0}),r.setTerrainStamper(He.DREAM,g=>n.stampInto(g)),r.setTerrainStamper(He.DRAB,g=>s.stampInto(g));const u=new nS({waterGlyphs:["~"],frequency:.55,speed:2.2,amplitude:1.4,secondaryWave:{frequency:1.9,speed:3.1,amplitude:.6,phase:1.3},opacity:.85,depthFade:.06});r.attachWaterShader(u);const f=new oS({maxEnergy:20,world:d});f.attachWorldManager(a),r.attachEnergySystem(f);const y=(d===He.DREAM?n:s).getPlayerSpawn()??{x:1,y:1},p=new PS({x:(y.x+.5)*c,y:(y.y+.5)*h,input:l,energySystem:f,cellWidth:c,cellHeight:h,world:d});r.attachPlayer(p);const _=(g,w)=>({x:(g+.5)*c,y:(w+.5)*h}),T=n.getSpawnsByType("NPC")[0]??{x:Math.min(n.cols-2,y.x+2),y:y.y},A=(()=>{const g=s.findInteractionCells("JUICE_CART")[0],w=[];g&&w.push({x:g.x+1,y:g.y},{x:g.x-1,y:g.y},{x:g.x,y:g.y+1},{x:g.x,y:g.y-1});const R=s.getPlayerSpawn()??{x:1,y:1};return w.push({x:R.x+1,y:R.y},{x:R.x,y:R.y+1},{x:R.x,y:R.y}),w.find(P=>s.isWalkableAt(P.x,P.y))??R})(),S=new Fs({..._(T.x,T.y),name:"Ira",char:"I",fgColor:"#ffd27f",interactionRadius:56,dialogue:KS}),M=new Fs({..._(A.x,A.y),name:"Juice Vendor",char:"V",fgColor:"#ff7700",interactionRadius:64,dialogue:jS});r.registerInteractableNPC(S),r.registerInteractableNPC(M),r.registerWorldLight({world:He.DREAM,x:S.x,y:S.y,radius:175,color:"#ffcf7d",intensity:.55}),r.registerWorldLight({world:He.DRAB,x:M.x,y:M.y,radius:150,color:"#ff7700",intensity:.6});const E={[He.DREAM]:[S],[He.DRAB]:[M]};r.attachEntityManager({update(g,w){for(const R of E[a.getActiveWorldId()]??[])R.update(g,w)},render(g,w,R){p.render(g,w,R);for(const O of E[a.getActiveWorldId()]??[])O.render(g,w,R);const P=r._network;if(P&&typeof P.getGhosts=="function")for(const O of P.getGhosts())O.render(g,w,R)}}),p.addEventListener("footstep",g=>{var N;const w=a.isDrab()?s:n,R=Math.floor(g.x/c),P=Math.floor(g.y/h),O=w.isInBounds(R,P)?w.getTileAt(R,P):null,B=kv(((N=O==null?void 0:O.tile)==null?void 0:N.name)??"Concrete Wall");r._sfx.play(ot.FOOTSTEP,{gainScale:g.sprint?1.15:B===ns.SOFT?.7:.95,filter:B===ns.SOFT?{type:"lowpass",frequency:900}:B===ns.HOLLOW?{type:"highpass",frequency:500}:null,pan:null})}),r.on("dialogueclose",({npcId:g})=>{g===M.id&&a.isDrab()&&f.isDepleted&&f.consumeJuice()});let C=!1;return f.addEventListener("restored",()=>{const g=a.getTransitionStatus();C=!(g.active&&g.to===He.DREAM)}),a.on("transitioncomplete",()=>{if(a.isDream()){C=!1;return}C&&a.isDrab()&&!f.isDepleted&&(C=!1,r.requestDimensionShift(He.DREAM,pn.JUICE_CONSUMED))}),console.info(`[DimensionContent] Loaded ${n.name} (${n.cols}x${n.rows}) and ${s.name} (${s.cols}x${s.rows}); player at (${y.x},${y.y}) in ${d}${i.length?` [fallback: ${i.join(", ")}]`:""}.`),{player:p,energy:f,water:u,npcs:{ira:S,vendor:M},maps:{dreamMap:n,drabMap:s},usedFallback:i}}const ZS=100,QS=96,eM=96,tM=24,iu=.18,iM=20,nM=32,nu=500,sM=8e3,rM="ws://localhost:8080",aM=new Set(["8080"]);class oM extends An{constructor(e,t={}){super({name:e.name??"wanderer",char:"@",fgColor:e.tint??"#ff7700",zIndex:ta.ENTITY,width:12,height:20,tags:["remote","ghost"],...t,x:e.x,y:e.y}),this._tint=e.tint??"#ff7700",this._ghostWorld=e.world??He.DREAM,this._anim=e.anim??"idle",this._ring=[{t:performance.now(),x:e.x,y:e.y}],this._sampleX=e.x,this._sampleY=e.y}get ghostWorld(){return this._ghostWorld}get anim(){return this._anim}onSnapshot(e,t,i,n,s){if(this._anim=s??this._anim,n!==this._ghostWorld){this._ghostWorld=n,this._ring.length=0,this._ring.push({t:e,x:t,y:i}),this._sampleX=t,this._sampleY=i,this._x=t,this._y=i;return}const a=this._ring[this._ring.length-1],o=Math.hypot(t-a.x,i-a.y)>QS;if(this._ring.push({t:e,x:t,y:i}),this._ring.length>nM&&this._ring.shift(),o)for(;this._ring.length>1;)this._ring.shift()}getRenderPosition(e=1,t=null){const i=t??{x:0,y:0},n=this._ring,s=performance.now()-ZS;if(n.length===0)return i.x=this._sampleX,i.y=this._sampleY,i;const a=n[n.length-1];if(s>=a.t||n.length===1)return this._sampleX=a.x,this._sampleY=a.y,i.x=a.x,i.y=a.y,i;for(let l=n.length-1;l>0;l-=1){const c=n[l-1],h=n[l];if(s>=c.t&&s<=h.t){const d=h.t-c.t,u=d>0?(s-c.t)/d:1;return this._sampleX=c.x+(h.x-c.x)*u,this._sampleY=c.y+(h.y-c.y)*u,i.x=this._sampleX,i.y=this._sampleY,i}}const o=n[0];return this._sampleX=o.x,this._sampleY=o.y,i.x=o.x,i.y=o.y,i}render(e,t=null){if(!t||this._ghostWorld!==this._localWorld)return;const i=this.getRenderPosition(1,lM),n=t.worldToScreen(i.x,i.y),s=Math.floor(n.x/(t._cellW||9.6)),a=Math.floor(n.y/(t._cellH||20)),o=this._anim==="idle"?Math.floor(Math.sin(performance.now()/900)*.5):0;e.setChar(s,a+o,"@",this._tint,null);const l=this._name.length>0?this._name[0].toUpperCase():"?";e.setChar(s,a-1+o,l,"#8a97a6",null)}}const lM={x:0,y:0};class cM{constructor(e={}){El(this,"_onLocalShift",null);if(e===null||typeof e!="object")throw new TypeError("[NetworkManager] options must be an object.");this._url=e.url??null,this._socketFactory=e.socketFactory??globalThis.WebSocket??null,this._status="idle",this._selfId=null,this._weatherSeed=null,this._seq=0,this._ws=null,this._intentionalClose=!1,this._reconnectTimer=null,this._backoffMs=nu,this._sendAccumulator=0,this._heartbeatCounter=0,this._lastIntent={x:0,y:0,sprint:!1},this._ghosts=new Map,this._player=null,this._game=null,this._localWorld=He.DREAM,this._listeners=new Map,this._lastSelfUpdate=0,this._rttMs=0,this._metrics={connects:0,disconnects:0,messagesIn:0,messagesOut:0,snapshots:0,corrections:0,softPulls:0}}attachGame(e){return this._game&&typeof this._game.off=="function"&&this._game.off("dimensionshift",this._onLocalShift),this._game=e,e&&typeof e.on=="function"&&(this._onLocalShift=t=>{t&&typeof t.to=="string"&&this.sendWorldShift(t.to,t.reason)},e.on("dimensionshift",this._onLocalShift),this._localWorld=e._worlds?e._worlds.getActiveWorldId():this._localWorld),this}attachPlayer(e){return this._player=e,this}get status(){return this._status}get isConnected(){return this._status==="connected"}get weatherSeed(){return this._weatherSeed}get selfId(){return this._selfId}get rttMs(){return this._rttMs}resolveUrl(){var e;if(this._url)return this._url;try{const i=new URLSearchParams(((e=globalThis.location)==null?void 0:e.search)??"").get("server");if(i)return i.startsWith("ws")?i:`ws://${i}`;const n=globalThis.location;if(n&&aM.has(n.port))return`${n.protocol==="https:"?"wss:":"ws:"}//${n.host}`}catch{}return rM}connect(e=null){if(this._intentionalClose||this._ws&&(this._status==="connecting"||this._status==="connected"))return!1;if(typeof this._socketFactory!="function")return console.warn("[NetworkManager] No WebSocket implementation; running offline."),!1;const t=e??this.resolveUrl();this._status="connecting";let i;try{i=new this._socketFactory(t)}catch(n){return console.warn(`[NetworkManager] socket construct failed (${t}):`,n),this._scheduleReconnect(),!1}return this._ws=i,i.onopen=()=>{var s,a;this._status="connected",this._metrics.connects+=1,this._backoffMs=nu;const n=(s=this._game)!=null&&s._renderer?{width:this._game._renderer.cellWidth,height:this._game._renderer.cellHeight}:{};this._rawSend({t:"join",name:typeof((a=this._player)==null?void 0:a.name)=="string"?this._player.name:"Wanderer",...n}),this.emit("connect",{url:t})},i.onmessage=n=>{this._metrics.messagesIn+=1;let s;try{s=JSON.parse(typeof n.data=="string"?n.data:"")}catch{return}s&&typeof s.t=="string"&&this._handleMessage(s)},i.onclose=()=>{if(this._metrics.disconnects+=1,this._ws=null,this._intentionalClose){this._status="closed";return}this._status="reconnecting",this.emit("disconnect",{willRetry:!0}),this._scheduleReconnect()},i.onerror=()=>{},!0}_scheduleReconnect(){if(this._reconnectTimer!==null||this._intentionalClose)return;const e=this._backoffMs*(.75+Math.random()*.5);this._backoffMs=Math.min(sM,this._backoffMs*2),this._reconnectTimer=setTimeout(()=>{this._reconnectTimer=null,this.connect()},e)}_rawSend(e){var t;return!this._ws||this._ws.readyState!==((t=this._socketFactory)==null?void 0:t.OPEN)?!1:(this._ws.send(JSON.stringify(e)),this._metrics.messagesOut+=1,!0)}_handleMessage(e){switch(e.t){case"welcome":this._selfId=Number.isFinite(e.id)?e.id:this._selfId,Number.isInteger(e.weatherSeed)&&e.weatherSeed!==this._weatherSeed&&(this._weatherSeed=e.weatherSeed>>>0,this.emit("seed",{seed:this._weatherSeed})),Array.isArray(e.players)&&this._applyRoster(e.players),this.emit("welcome",{id:this._selfId,seed:this._weatherSeed});break;case"state":this._metrics.snapshots+=1,Number.isInteger(e.weatherSeed)&&(this._weatherSeed=e.weatherSeed>>>0),Array.isArray(e.players)&&this._applyRoster(e.players);break;case"shift":this.emit("remoteshift",{id:e.id,from:e.from,to:e.to});break;case"leave":this._ghosts.delete(e.id),this.emit("remoteleave",{id:e.id});break;case"pong":Number.isFinite(e.ts)&&(this._rttMs=Math.round(performance.now()-e.ts));break}}_applyRoster(e){const t=performance.now(),i=new Set;for(const n of e){if(!n||!Number.isFinite(n.id))continue;if(i.add(n.id),n.id===this._selfId){this._reconcileSelf(n);continue}let s=this._ghosts.get(n.id);s||(s=new oM(n),this._ghosts.set(n.id,s),this.emit("remotejoin",{id:n.id,name:n.name})),s._localWorld=this._localWorld,s.onSnapshot(t,n.x,n.y,n.world,n.anim)}for(const n of[...this._ghosts.keys()])i.has(n)||this._ghosts.delete(n)}_reconcileSelf(e){const t=this._player;if(!t||!Number.isFinite(e.x)||!Number.isFinite(e.y))return;if(this._lastSelfUpdate=performance.now(),e.world!==void 0&&e.world!==t.world){t.applyServerCorrection(e),this._metrics.corrections+=1;return}const i=e.x-t.x,n=e.y-t.y,s=Math.hypot(i,n);s>eM?(t.applyServerCorrection(e),this._metrics.corrections+=1):s>tM&&(t.teleport(t.x+i*iu,t.y+n*iu),this._metrics.softPulls+=1)}update(e,t=null){var a;if(!this.isConnected)return;if((a=this._game)!=null&&a._worlds){this._localWorld=this._game._worlds.getActiveWorldId();for(const o of this._ghosts.values())o._localWorld=this._localWorld}this._sendAccumulator+=e;const i=1/iM;if(this._sendAccumulator<i)return;this._sendAccumulator=0;const n=this._sampleIntent(t),s=n.x!==this._lastIntent.x||n.y!==this._lastIntent.y||n.sprint!==this._lastIntent.sprint;this._heartbeatCounter=(this._heartbeatCounter+1)%4,(s||this._heartbeatCounter===0)&&(this._seq+=1,this._rawSend({t:"input",seq:this._seq,...n}),this._lastIntent=n),this._seq%20===0&&this._rawSend({t:"ping",ts:performance.now()})}_sampleIntent(e){let t=0,i=0,n=!1;if(e&&typeof e.getMovementVector=="function"){const s=e.getMovementVector();t=Number.isFinite(s==null?void 0:s.x)?s.x:0,i=Number.isFinite(s==null?void 0:s.y)?s.y:0,n=typeof e.isActionDown=="function"?e.isActionDown("SPRINT"):!1}else if(this._player){t=this._player.vx,i=this._player.vy;const s=Math.hypot(t,i);s>1&&(t/=s,i/=s)}return{x:t,y:i,sprint:n}}sendWorldShift(e,t="SCRIPTED"){return this._rawSend({t:"shift",to:e,reason:t})}getGhosts(){const e=[];for(const t of this._ghosts.values())t.ghostWorld===this._localWorld&&e.push(t);return e}getMetrics(){return{status:this._status,url:this._url??this.resolveUrl(),selfId:this._selfId,weatherSeed:this._weatherSeed,rttMs:this._rttMs,ghosts:this._ghosts.size,...this._metrics,lastSelfUpdateAgeMs:this._lastSelfUpdate?Math.round(performance.now()-this._lastUpdateNow()):null}}_lastUpdateNow(){return this._lastSelfUpdate}on(e,t){if(typeof t!="function")throw new TypeError("[NetworkManager] listener must be a function.");let i=this._listeners.get(e);return i||(i=new Set,this._listeners.set(e,i)),i.add(t),()=>this.off(e,t)}off(e,t){const i=this._listeners.get(e);return i&&(i.delete(t),i.size===0&&this._listeners.delete(e)),this}emit(e,t){const i=this._listeners.get(e);if(i)for(const n of i)try{n(t)}catch(s){console.error(`[NetworkManager] '${e}' listener failed:`,s)}}destroy(){if(this._intentionalClose=!0,this._reconnectTimer!==null&&(clearTimeout(this._reconnectTimer),this._reconnectTimer=null),this._game&&typeof this._game.off=="function"&&this._onLocalShift&&this._game.off("dimensionshift",this._onLocalShift),this._ws){try{this._ws.close()}catch{}this._ws=null}this._ghosts.clear(),this._listeners.clear(),this._status="closed"}}const su="gameCanvas",hM=2,uM=1/60;let ei=null,yi=null,ro=null,ru=!1,au=!1;function ol(r,e){if(ru)return;ru=!0,console.error(`[index] ${r}:`,e);const t=document.createElement("div");t.id="fatal-error-overlay",t.setAttribute("role","alert"),t.style.cssText=["position:fixed","inset:0","z-index:9999","display:flex","align-items:center","justify-content:center","background:rgba(0,0,0,0.92)","color:#d7e3ee","font-family:monospace","text-align:center","padding:2rem"].join(";");const i=document.createElement("div"),n=document.createElement("h1");n.textContent=r,n.style.cssText="color:#ff7700;font-size:1.4rem;margin-bottom:1rem;";const s=document.createElement("p");s.textContent=e,s.style.cssText="max-width:40rem;line-height:1.6;";const a=document.createElement("p");a.textContent="Try reloading the page. If this persists, your browser may not support the Canvas features this game requires.",a.style.cssText="color:#6d7c8c;margin-top:1.25rem;font-size:0.85rem;",i.appendChild(n),i.appendChild(s),i.appendChild(a),t.appendChild(i),document.body.appendChild(t)}function id(){const r=yi.getBoundingClientRect(),e=Math.max(1,Math.floor(r.width)),t=Math.max(1,Math.floor(r.height)),i=typeof window.devicePixelRatio=="number"&&window.devicePixelRatio>0?window.devicePixelRatio:1,n=Math.min(i,hM),s=Math.max(1,Math.round(e*n)),a=Math.max(1,Math.round(t*n));return(yi.width!==s||yi.height!==a)&&(yi.width=s,yi.height=a),{cssWidth:e,cssHeight:t,backingWidth:s,backingHeight:a,dpr:n}}function dM(){if(!ei||!yi)return;const r=id();ei.handleResize(r)}function ou(){ro===null&&(ro=requestAnimationFrame(()=>{ro=null,dM()}))}function Cs(r){if(!ei)return;const e=ei._loop;e&&(r?e.pause():e.resume())}function fM(){Cs(document.hidden)}function pM(r){r.filename&&/^(chrome-extension|moz-extension|safari-web-extension):/.test(r.filename)||ol("YUCCA hit a snag",r.message||"An unexpected error occurred.")}function _M(r){const e=r.reason instanceof Error?r.reason.message:String(r.reason);ol("YUCCA hit a snag",e)}function mM(){const r={fixedTimeStep:uM};try{const e=new URLSearchParams(window.location.search),t=e.get("seed");if(t!==null&&t!==""){const n=parseInt(t,10);Number.isInteger(n)&&(r.seed=n)}const i=e.get("world");(i==="DREAM"||i==="DRAB")&&(r.initialWorld=i)}catch(e){console.warn("[index] Could not read boot options from URL:",e)}return r}function gM(){window.addEventListener("resize",ou),window.addEventListener("orientationchange",ou),document.addEventListener("visibilitychange",fM),window.addEventListener("blur",()=>Cs(!0)),window.addEventListener("focus",()=>Cs(!1)),window.addEventListener("pagehide",()=>Cs(!0)),window.addEventListener("pageshow",()=>Cs(!1)),window.addEventListener("error",pM),window.addEventListener("unhandledrejection",_M)}async function xM(){if(au)return;if(au=!0,document.title="YUCCA",yi=document.getElementById(su),!yi||!(yi instanceof HTMLCanvasElement))throw new Error(`Could not find a <canvas id="${su}"> element in the page.`);if(!yi.getContext("2d",{alpha:!0}))throw new Error("Your browser could not create a Canvas 2D context. Hardware acceleration may be disabled.");id();const e=document.getElementById("glCanvas");ei=new Lv(yi,{...mM(),glCanvas:e??null});const t=JS(ei);window.__content__=t;const i=ei.start(),n=new cM;n.attachGame(ei),t&&n.attachPlayer(t.player),ei.attachNetworkManager(n),window.__net__=n,n.on("seed",({seed:o})=>{ei._weather.setSeed(o),ei._loadingScreen.setSeed(o)});const s=ei._loadingScreen;s.setPhase("connecting","connecting to the hour…"),n.on("connect",()=>s.setPhase("connecting","handshaking…")),n.on("welcome",({id:o,seed:l})=>{s.setPhase("connected",`connected · wanderer #${o} · storm seed ${l}`),s.setProgress(.95),i.then(()=>s.setPhase("ready","the grove is listening — press SPACE"))}),n.connect();const a=setTimeout(()=>{!s.isReady&&n.status!=="connected"&&s.setPhase("offline","server unreachable · solo exploration")},4e3);window.addEventListener("pagehide",()=>clearTimeout(a),{once:!0}),window.game=ei,gM(),await i,console.info("%cYUCCA%c engine online — access it via window.game","color:#ff7700;font-weight:bold;","color:#d7e3ee;")}function lu(){xM().catch(r=>{ol("Failed to start the game",r&&r.message?r.message:String(r))})}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",lu,{once:!0}):lu();
//# sourceMappingURL=index-DP_L2kFF.js.map
