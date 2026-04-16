import React, { useRef, useState, useEffect } from 'react';

// ==========================================
// 🎨 색상 프리셋(테마) 설정
// ==========================================
const THEMES = {
  Sunset: ['#f43f5e', '#f97316', '#eab308', '#fbbf24', '#f87171'],
  Ocean: ['#0ea5e9', '#3b82f6', '#06b6d4', '#14b8a6', '#38bdf8'],
  Neon: ['#a855f7', '#d946ef', '#ec4899', '#8b5cf6', '#6366f1'],
  Forest: ['#22c55e', '#10b981', '#14b8a6', '#84cc16', '#4ade80'],
  Phantom: ['#ffffff', '#d4d4d8', '#a1a1aa', '#71717a', '#f4f4f5']
};

export default function App() {
  const [started, setStarted] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const [morphing, setMorphing] = useState(65);
  const [shapeCount, setShapeCount] = useState(6);
  const [theme, setTheme] = useState('Neon');
  const [currentColors, setCurrentColors] = useState(THEMES['Neon']);
  const [complexity, setComplexity] = useState(4);
  const [reactivity, setReactivity] = useState(70);
  const [blurIntensity, setBlurIntensity] = useState(80);

  const canvasRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const frameRef = useRef(null);

  // 애니메이션을 부드럽게 만들기 위한 값 추적기 (Exponential Smoothing & Lerp)
  const timeRef = useRef(0);
  const smoothedBass = useRef(0);
  const smoothedMid = useRef(0);
  const smoothedHigh = useRef(0);
  const smoothedPaletteRef = useRef(null);
  
  // 비트 기반 사이드 파동 생성을 위한 상수
  const prevBassRef = useRef(0);
  const prevMidRef = useRef(0);
  const lastBeatTimeRef = useRef(0);
  const sideRipplesRef = useRef([]);

  // 1. 마이크 허용 및 오디오 분석기 초기화
  const startVibe = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      const source = audioCtx.createMediaStreamSource(stream);

      source.connect(analyser);
      analyser.fftSize = 512;

      const bufferLength = analyser.frequencyBinCount;
      dataArrayRef.current = new Uint8Array(bufferLength);

      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;
      setStarted(true);
    } catch (err) {
      alert('마이크 접근 권한이 필요합니다. 🎤 permissions을 허용해주세요.');
    }
  };

  // 2. 캔버스 실시간 렌더링 루프
  useEffect(() => {
    if (!started || !canvasRef.current || !analyserRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const draw = () => {
      frameRef.current = requestAnimationFrame(draw);

      const analyser = analyserRef.current;
      const dataArray = dataArrayRef.current;

      // 마이크 오디오 주파수 데이터 받아오기
      analyser.getByteFrequencyData(dataArray);

      // 🎯 주파수 대역 분리 (FFT 512 기반, 1 Bin = 약 93.75Hz)
      
      // 1. 저주파(Bass): 메인 구체 스케일 펌핑 & 강한 리플 생성 
      // 주의: 0번 Bin(0~93Hz)은 마이크 바람소리 등 초저역 노이즈이므로 배제. 
      // 1~3번 Bin(약 94Hz ~ 281Hz) 구간만 사용하여 실제 음악의 타격감(킥 드럼과 진짜 베이스 기타)만 칼같이 캐치합니다.
      let bassSum = 0;
      const bassStart = 1; 
      const bassEnd = 4;   // 94Hz ~ 281Hz 구역 (Kick & Sub-Bass)
      for (let i = bassStart; i < bassEnd; i++) bassSum += dataArray[i];
      const rawBass = (bassSum / Math.max(bassEnd - bassStart, 1)) / 255;
      
      // 지속적인 팽창으로 화면 사이즈가 먹먹하게 고정되는 걸 막기 위해, 베이스가 터질 때만 튀어오르도록 증폭률 절반 하향 (1.5 -> 0.75)
      const activeBass = rawBass * 0.75; 
      const currentBass = Math.min(activeBass, 1.0);

      // 2. 중주파(Mid): 보컬 영역, 리플 전용 생성 트리거 (메인 구체 팽창엔 영향 적음)
      let midSum = 0;
      const midStart = 4;  // 약 375Hz 부터
      const midEnd = 25;   // ~2343Hz (사람 목소리, 기타, 멜로디 타격음)
      for (let i = midStart; i < midEnd; i++) midSum += dataArray[i];
      const rawMid = (midSum / Math.max(midEnd - midStart, 1)) / 255;
      const activeMid = rawMid * 1.4; // 절반 감속 (2.8 -> 1.4)
      const currentMid = Math.min(activeMid, 1.0);

      // 3. 고주파(High 피치): 일렁이는 이펙트 (Morphing) 가속 전용
      let highSum = 0;
      const highStart = 25; // 약 2343Hz 부터
      const highEnd = 80;   // ~7500Hz (심벌즈, 하이햇, 치찰음 등)
      for (let i = highStart; i < highEnd; i++) highSum += dataArray[i];
      const rawHigh = (highSum / Math.max(highEnd - highStart, 1)) / 255;
      const currentHigh = Math.min(rawHigh * 1.4, 1.0); // 절반 감속 (2.8 -> 1.4)

      // 심장 박동(Heartbeat) 비대칭 모션: 쿵(Attack)하고 빠르게 팽창 후 슬로우 수축(Release)
      const bassDiff = currentBass - smoothedBass.current;
      if (bassDiff > 0) {
        smoothedBass.current += bassDiff * 0.85; // 타격할 때는 한계치까지 아주 쫀득하게 확 커짐
      } else {
        // [★사이즈 복원력 극대화]: 수축 속도(Decay)를 대폭 상향(0.05 -> 0.25).
        // 노래 파형이 지속되더라도 멍청하게 고정되지 않고, 베이스 타격이 끝난 직후 즉시 훅 줄어들며 역동적인 탱글탱글한 바운스를 복구함.
        smoothedBass.current += bassDiff * 0.25; 
      }
      smoothedMid.current += (currentMid - smoothedMid.current) * 0.1;
      smoothedHigh.current += (currentHigh - smoothedHigh.current) * 0.1;

      // 하이피치(고주파동)를 섞어 소리가 날카로울 때 구체가 기괴하게 일렁이도록 연출 (Morphing 가속 - 전체 다이나믹스 125%로 증폭)
      timeRef.current += (0.005 + (smoothedHigh.current * 0.02 * (reactivity / 100))) * 1.25;

      const container = canvas.parentElement;
      
      // 배경 다이나믹 업데이트 (리액트 state 대신 DOM 직접 수정으로 60fps 보장)
      // 배경 색상이 음악의 고주파와 시간에 따라 색(Hue)이 돌고 베이스(킥)에 맞춰 번쩍거립니다
      const bgElement = container.parentElement;
      if (bgElement) {
        bgElement.style.filter = `hue-rotate(${smoothedHigh.current * 40 + Math.sin(timeRef.current * 0.1) * 30}deg) brightness(${1 + currentBass * 0.35})`;
      }

      const { width, height } = container.getBoundingClientRect();
      const dpi = window.devicePixelRatio || 1;

      // 캔버스 사이즈 리사이징 처리
      if (canvas.width !== width * dpi || canvas.height !== height * dpi) {
        canvas.width = width * dpi;
        canvas.height = height * dpi;
        ctx.scale(dpi, dpi);
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
      }

      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      
      // 디폴트(조용한 상태) 볼륨 사이즈를 기존 크기의 약 60%로 대폭 축소 (0.175 * 0.6 = 0.105)
      const radiusBase = Math.min(width, height) * 0.105;
      const targetPalette = currentColors.slice(0, complexity);

      // 팔레트 색상 부드러운 전환 (Lerp)
      if (!smoothedPaletteRef.current || smoothedPaletteRef.current.length !== targetPalette.length) {
        smoothedPaletteRef.current = targetPalette.map(hex => hexToRGB(hex).split(',').map(Number));
      }
      smoothedPaletteRef.current = smoothedPaletteRef.current.map((currRGB, idx) => {
        const targetRGB = hexToRGB(targetPalette[idx]).split(',').map(Number);
        return [
          currRGB[0] + (targetRGB[0] - currRGB[0]) * 0.04,
          currRGB[1] + (targetRGB[1] - currRGB[1]) * 0.04,
          currRGB[2] + (targetRGB[2] - currRGB[2]) * 0.04
        ];
      });

      // 오디오 변화 폭(Amplitude) 극대화: 기본 크기가 작아진 만큼, 최대 크기 도달을 위한 스케일 점프 폭을 엄청나게 높임
      // (125% 물리 다이나믹스 상향으로 인해 이전 최대 폭 1.833 -> 2.29 배로 증폭)
      const scaleJump = Math.min(smoothedBass.current * (reactivity / 100) * 2.29, 2.29);
      const audioScale = 1 + scaleJump;

      // 하이라이트를 위한 Screen 블렌드 모드 (빛이 중첩될수록 밝아짐)
      ctx.globalCompositeOperation = 'screen';

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(timeRef.current * 0.1); // 중심축 서서히 자전
      ctx.translate(-cx, -cy);

      // 🎈 블롭 그리기 핵심 헬퍼 함수
      const drawBlob = (baseR, scale, layerIdx, alpha, tOffset, blurPx, cIdxMain, cIdxSub) => {
        ctx.filter = `blur(${Math.max(blurPx, 0)}px)`;
        ctx.beginPath();
        const points = 120;
        const offsetTime = tOffset + (layerIdx * 15.5);

        for (let j = 0; j <= points; j++) {
          const angle = (j / points) * Math.PI * 2;
          const n1 = Math.sin(angle * 2 + offsetTime * 1.2);
          const n2 = Math.sin(angle * 3 - offsetTime * 0.8) * 0.5;
          const n3 = Math.sin(angle * 4 + offsetTime * 0.5) * 0.25;
          const noiseVal = (n1 + n2 + n3) / 1.75;

          const morphFactor = morphing / 100;
          const radiusOffset = baseR * morphFactor * noiseVal * 0.4;
          const r = (baseR + radiusOffset) * scale;

          const orbitR = 40 * morphFactor;
          const ox = Math.cos(offsetTime * 0.7) * orbitR;
          const oy = Math.sin(offsetTime * 0.7) * orbitR;

          const px = cx + ox + Math.cos(angle) * r;
          const py = cy + oy + Math.sin(angle) * r;

          if (j === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();

        // 그라디언트 색상 다이나믹 회전(Swirling): 
        // 고정된 인덱스가 아닌 시간에 흐름에 따라 메인 컬러와 서브 컬러가 팔레트 배열 안에서 물리적으로 돌게(교체되게) 만듭니다.
        const dynamicMainIdx = (cIdxMain + Math.floor(tOffset * 0.15)) % targetPalette.length;
        const dynamicSubIdx = (cIdxSub + Math.floor(tOffset * 0.2) + 1) % targetPalette.length;

        const mainColorArr = smoothedPaletteRef.current[dynamicMainIdx];
        const subColorArr = smoothedPaletteRef.current[dynamicSubIdx];
        
        const rgbMain = `${Math.round(mainColorArr[0])}, ${Math.round(mainColorArr[1])}, ${Math.round(mainColorArr[2])}`;
        const rgbSub = `${Math.round(subColorArr[0])}, ${Math.round(subColorArr[1])}, ${Math.round(subColorArr[2])}`;

        const gradRadius = Math.max(baseR * scale * 1.5, 1);
        
        // 레디얼 위치 이동 속도를 '현재 속도의 25% 수준'으로 대폭 감속 (너무 정신 사나운 궤도 차분하게 만들기)
        const liquidTime1 = tOffset * 0.203; // 0.8125 * 0.25
        const liquidTime2 = tOffset * 0.171; // 0.6875 * 0.25
        
        // 예측 불가능한(랜덤에 가까운) 고주파 플러터(Flutter) 노이즈 진폭을 1/3 수준으로 대폭 축소 (0.4 -> 0.133)
        const randomFlutterX = Math.sin(liquidTime2 * 3.1 + layerIdx) * 0.133;
        const randomFlutterY = Math.cos(liquidTime1 * 2.8 - layerIdx) * 0.133;

        // 초고속 다방향 혼합 이동: 좌표가 요동치는 '전체 이동 반경(Radius)' 자체를 기존 0.7에서 0.23 (1/3)으로 깎아냄
        const focalOffsetX = cx + (Math.cos(liquidTime1 + layerIdx * 1.2) * 0.5 + Math.sin(liquidTime2 * 1.4) * 0.3 + randomFlutterX) * (gradRadius * 0.23);
        const focalOffsetY = cy + (Math.sin(liquidTime2 + layerIdx * 0.8) * 0.5 + Math.cos(liquidTime1 * 1.1) * 0.3 + randomFlutterY) * (gradRadius * 0.23);

        const grad = ctx.createRadialGradient(focalOffsetX, focalOffsetY, 0, cx, cy, gradRadius);
        
        // 스탑 무빙 속도도 거칠게 요동침
        const midStop = 0.5 + (Math.sin(liquidTime1 * 1.5 + layerIdx) * 0.7 + Math.cos(liquidTime2 * 2.0)) * 0.15; 

        // 불투명도(Alpha)에도 불규칙적인 노이즈/랜덤 값을 삽입 (빛이 깜빡이거나 요동치듯 연출)
        // [변경] 불투명도를 최대 60%로 제한 (눈부심 및 색깔 지옥 방지)
        const randomAlpha1 = Math.max(0.2, 0.6 + Math.sin(liquidTime1 * 5.2 + layerIdx * 3) * 0.5) * 0.6; // 0.12 ~ 0.66
        const randomAlpha2 = Math.max(0.4, 0.8 + Math.cos(liquidTime2 * 4.7 - layerIdx * 2) * 0.4) * 0.6; // 0.24 ~ 0.72

        grad.addColorStop(0, `rgba(${rgbMain}, 0.0)`);
        grad.addColorStop(Math.max(midStop, 0.1), `rgba(${rgbSub}, ${Math.min(randomAlpha1 * alpha, 1.0)})`);
        grad.addColorStop(1, `rgba(${rgbMain}, ${Math.min(randomAlpha2 * alpha, 1.0)})`);

        ctx.fillStyle = grad;
        ctx.fill();
        ctx.filter = 'none'; // 다음 렌더링을 위해 리셋
      };

      // 💥 오디오 비트 강도 기반 사이드 구체 방출 (Beat Detection)
      // 베이스(Kick) 또는 중간음역(Vocal) 피크 발생 시 리플 스폰
      if (
        (activeBass > 0.55 && (activeBass - prevBassRef.current) > 0.04) ||
        (activeMid > 0.60 && (activeMid - prevMidRef.current) > 0.04)
      ) {
        if (Date.now() - lastBeatTimeRef.current > 250) {
          lastBeatTimeRef.current = Date.now();
          // 메인 구체가 커진 직후의 팽창한 크기(audioScale 적용된 상태)를 초기 크기로 사이드 구체 생성
          sideRipplesRef.current.push({
            radius: radiusBase * audioScale * 1.3, 
            scale: 1.0,
            alpha: 0.6,
            timeOffset: timeRef.current,
            colorMain: Math.floor(Math.random() * targetPalette.length),
            colorSub: Math.floor(Math.random() * targetPalette.length)
          });
        }
      }
      prevBassRef.current = activeBass;
      prevMidRef.current = activeMid;

      // 🌟 1. 제자리에서 펌핑하는 메인 구체 그리기
      for (let i = 0; i < shapeCount; i++) {
        const shapeRatio = 1 - (i * (0.8 / Math.max(shapeCount, 2)));
        const baseLayerRadius = Math.max(radiusBase * shapeRatio, 10) * 1.3;
        
        const depthBlur = (1 - shapeRatio) * 1.5;
        // audioScale 최대치가 2.83배로 늘어났으므로, 팽창 시 블러 폭주를 막기 위해 계수를 0.76배율로 보정
        const scaleBlurFactor = (audioScale - 1) * 0.76;
        
        // 블러 다이나믹스: 프로그레시브 블러가 단순히 머무는게 아니라 시간에 따라 '먹었다가 줄었다가' 거칠게 맥동(Pulsing)합니다
        const dynamicBlurPulse = 0.5 + Math.sin(timeRef.current * 0.4 + i * 1.2) * 0.6; // 0 ~ 1.1 비율로 요동침
        const layerBlur = Math.max((blurIntensity * 0.3) * (depthBlur + scaleBlurFactor) * dynamicBlurPulse, 0);
        // 1.0에서 0.6으로 기본 최고 투명도를 제한
        drawBlob(baseLayerRadius, audioScale, i, 0.6, timeRef.current, layerBlur, i, i + 1);
      }

      // 💫 2. 줄어들지 않고 무한히 팽창하며 투명해지는 사이드 구체들 그리기
      for (let i = sideRipplesRef.current.length - 1; i >= 0; i--) {
        const ripple = sideRipplesRef.current[i];
        
        // 반응성에 따라 팽창 속도 결정, Opacity 서서히 제거
        ripple.scale += 0.015 + (reactivity / 100) * 0.015;
        ripple.alpha -= 0.012; 
        
        // 투명도가 다 떨어지면 배열에서 제거하여 최적화
        if (ripple.alpha <= 0) {
          sideRipplesRef.current.splice(i, 1);
          continue;
        }
        
        // 퍼져나갈수록 블러가 강력해지도록 설정 (프로그레시브 블러 연장선)
        const rippleBlur = blurIntensity * 0.5 * ripple.scale;
        
        drawBlob(
          ripple.radius, 
          ripple.scale, 
          0, // 외곽 단일 레이어 취급
          ripple.alpha, 
          timeRef.current, // 메인 구체와 동일한 파동 흐름 공유
          rippleBlur, 
          ripple.colorMain, 
          ripple.colorSub
        );
      }

      ctx.restore();
    };

    draw();

    return () => {
      cancelAnimationFrame(frameRef.current);
    }
  }, [started, morphing, shapeCount, theme, complexity, reactivity]);

  return (
    <div className="h-screen w-full flex overflow-hidden bg-black font-sans">

      {/* 🔴 최초 실행 시작 버튼 오버레이 */}
      {!started && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md">
          <div className="flex flex-col items-center gap-6 p-10 rounded-3xl bg-white/5 border border-white/10 shadow-2xl">
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-indigo-500 to-pink-500 animate-pulse flex items-center justify-center shadow-[0_0_40px_rgba(236,72,153,0.4)]">
              <Icons.Mic className="w-8 h-8 text-white" />
            </div>
            <div className="text-center">
              <h2 className="text-3xl font-bold text-white mb-2">Blurry Vibe</h2>
              <p className="text-white/60 text-sm">오디오 리액션을 활성화하기 위해 <br /> 마이크 권한을 허용해 주세요.</p>
            </div>
            <button
              onClick={startVibe}
              className="mt-4 px-8 py-3 rounded-full bg-white text-black font-bold text-lg hover:bg-gray-200 transition-all active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
            >
              Start Vibe
            </button>
          </div>
        </div>
      )}

      {/* UI 패널 토글 버튼 */}
      {started && (
        <button 
          onClick={() => setUiVisible(!uiVisible)}
          className="absolute top-6 right-6 z-40 p-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white transition-all duration-300 shadow-[0_0_15px_rgba(0,0,0,0.5)] active:scale-95"
          title="Toggle Settings"
        >
          <Icons.Layers />
        </button>
      )}

      {/* ============== 좌측 캔버스 (비주얼라이저) ============== */}
      <div
        className={`${uiVisible ? 'w-[70%]' : 'w-full'} h-full relative flex items-center justify-center overflow-hidden transition-all duration-700 ease-in-out`}
        style={{ backgroundColor: `rgba(${hexToRGB(currentColors[0])}, 0.12)` }}
      >
        {/* 블러(blur) 효과가 가장자리에서 짤리는 것을 방지하기 위해 컨테이너의 크기를 화면보다 크게 만듬 */}
        <div
          className="absolute"
          style={{
            top: '-150px', bottom: '-150px', left: '-150px', right: '-150px',
            // 캔버스 자체 Progressive Blur가 걸리므로, 전체 컨테이너 블러는 베이스 질감을 위해서만 매우 약하게 활성화
            filter: `blur(${blurIntensity * 0.1}px)`
          }}
        >
          <canvas ref={canvasRef} className="w-full h-full block" />
        </div>
      </div>

      {/* ============== 우측 글래스모피즘 컨트롤 패널 ============== */}
      <div 
        className={`${uiVisible ? 'w-[30%] opacity-100 translate-x-0' : 'w-0 opacity-0 translate-x-full overflow-hidden'} h-full flex flex-col p-8 gap-6 z-10 bg-white/10 backdrop-blur-xl border-l border-white/20 text-white custom-scrollbar transition-all duration-700 ease-in-out origin-right shrink-0 absolute right-0 top-0`}
      >
        <div className="space-y-1 mt-12 overflow-visible">
          <h1 className="text-2xl font-extrabold bg-gradient-to-br from-white to-white/40 bg-clip-text text-transparent tracking-tight whitespace-nowrap">
            Visualizer Test
          </h1>
          <p className="text-xs text-white/40 font-semibold tracking-widest uppercase whitespace-nowrap">
            made by uichan
          </p>
        </div>

        <div className="flex flex-col gap-6">
          <ThemeSelector 
            currentTheme={theme} 
            onSelect={(name) => {
              setTheme(name);
              setCurrentColors(THEMES[name]);
            }} 
            onRandom={() => {
              setTheme('Random');
              setCurrentColors(generateRandomPalette());
            }}
          />

          <div className="w-full h-[1px] bg-white/5 my-2"></div>

          <Slider label="Morphing" value={morphing} onChange={setMorphing} min={0} max={100} icon={<Icons.Waves />} />
          <Slider label="Shape Layers" value={shapeCount} onChange={setShapeCount} min={1} max={12} icon={<Icons.Layers />} />
          <Slider label="Color Mix Count" value={complexity} onChange={setComplexity} min={1} max={5} icon={<Icons.Palette />} />
          <Slider label="Reactivity" value={reactivity} onChange={setReactivity} min={0} max={100} icon={<Icons.Activity />} />
          <Slider label="Blur Intensity" value={blurIntensity} onChange={setBlurIntensity} min={0} max={150} icon={<Icons.Blur />} />
        </div>
      </div>

    </div>
  );
}

// ==========================================
// 🧩 하위 UI 컴포넌트: 슬라이더
// ==========================================
function Slider({ label, value, onChange, min, max, step = 1, icon }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center text-xs font-semibold text-white/70 uppercase tracking-wide">
        <span className="flex items-center gap-2">
          {icon} {label}
        </span>
        <span className="bg-white/10 px-2 py-0.5 rounded-md text-white font-mono border border-white/5">
          {value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-white hover:accent-gray-300 transition-all outline-none"
      />
    </div>
  )
}

// ==========================================
// 🧩 하위 UI 컴포넌트: 테마 프리셋 선택기
// ==========================================
function ThemeSelector({ currentTheme, onSelect, onRandom }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center text-xs font-semibold text-white/70 uppercase tracking-wide mb-1">
        <span className="flex items-center gap-2">
          <Icons.Palette /> Color Theme
        </span>
        <button 
          onClick={onRandom}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-md transition-all active:scale-95 text-[10px] tracking-wider border border-white/10 shadow-[0_0_10px_rgba(255,255,255,0.05)]"
        >
          <Icons.Shuffle /> RANDOM
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Object.entries(THEMES).map(([name, colors]) => (
          <button
            key={name}
            onClick={() => onSelect(name)}
            className={`flex flex-col items-start p-3 rounded-xl border transition-all duration-300 ${currentTheme === name
                ? 'bg-white/10 border-white/30 shadow-[0_4px_20px_rgba(255,255,255,0.05)]'
                : 'bg-transparent border-white/5 hover:bg-white/5'
              }`}
          >
            <span className="text-[11px] font-bold text-white/90 mb-2 uppercase tracking-wider">{name}</span>
            <div className="flex w-full h-2 rounded-full overflow-hidden">
              {colors.map((c, i) => (
                <div key={i} className="flex-1 h-full" style={{ backgroundColor: c }} />
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ==========================================
// 🛠️ 유틸 함수 모음
// ==========================================
// 랜덤 팔레트 생성기 (엄청나게 다양한 무작위 스펙트럼 추출)
const generateRandomPalette = () => {
  const colors = [];
  for (let i = 0; i < 5; i++) {
    // 기존의 일정한 간격(45도)을 버리고 0~360도 전체 범위를 완전 랜덤하게 추출하여 다채로움을 극대화
    const h = Math.floor(Math.random() * 360); 
    const s = 65 + Math.random() * 35; // 65~100% (칙칙함 방지)
    const l = 40 + Math.random() * 20; // 40~60%
    colors.push(hslToHex(h, s, l));
  }
  return colors;
};

const hslToHex = (h, s, l) => {
  l /= 100;
  const a = s * Math.min(l, 1 - l) / 100;
  const f = n => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

const hexToRGB = (hex) => {
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex[1] + hex[2], 16);
    g = parseInt(hex[3] + hex[4], 16);
    b = parseInt(hex[5] + hex[6], 16);
  }
  return `${r}, ${g}, ${b}`;
};

const Icons = {
  Mic: (props) => <svg viewBox="0 0 24 24" className="w-8 h-8 shrink-0 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" /></svg>,
  Activity: (props) => <svg viewBox="0 0 24 24" className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>,
  Blur: (props) => <svg viewBox="0 0 24 24" className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="10" /><path d="M12 2a10 10 0 0 0 0 20" /></svg>,
  Layers: (props) => <svg viewBox="0 0 24 24" className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>,
  Waves: (props) => <svg viewBox="0 0 24 24" className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M2 12h4l2 -9l5 18l4 -6h5" /></svg>,
  Palette: (props) => <svg viewBox="0 0 24 24" className="w-6 h-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="13.5" cy="6.5" r=".5" /><circle cx="17.5" cy="10.5" r=".5" /><circle cx="8.5" cy="7.5" r=".5" /><circle cx="6.5" cy="12.5" r=".5" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" /></svg>,
  Shuffle: (props) => <svg viewBox="0 0 24 24" className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}><polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" /></svg>
};
