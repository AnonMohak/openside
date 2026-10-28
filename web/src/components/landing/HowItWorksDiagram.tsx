import { useId } from "react";
import { useReducedMotion } from "framer-motion";

// Diagram of the two paths media takes in a call: the compressed live call
// through LiveKit, and the full-quality local recording uploaded to storage.

const DEVICE_X = 20;
const DEVICE_W = 220;
const DEVICE_H = 100;
const MID_X = 390;
const MID_W = 220;
const OUT_X = 760;
const OUT_W = 220;

const devices = [
  { initial: "Y", name: "You", y: 40 },
  { initial: "G", name: "Guest", y: 160 },
  { initial: "G", name: "Guest", y: 280 },
];

const LIVE = { y: 40, h: 100 };
const STORAGE = { y: 290, h: 100 };
const OUTPUT = { y: 230, h: 180 };

const outputs = [
  "Mixed recording",
  "Separate track per person",
  "MP4, WebM, MP3, WAV",
  "Share link with comments",
];

const Box = ({
  x,
  y,
  w,
  h,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
}) => (
  <rect
    x={x}
    y={y}
    width={w}
    height={h}
    rx={14}
    className="fill-foreground/[0.03] stroke-border"
    strokeWidth={1}
  />
);

const HowItWorksDiagram = () => {
  const id = useId().replace(/:/g, "");
  const reduceMotion = useReducedMotion();
  const liveY = LIVE.y + LIVE.h / 2;
  const storageY = STORAGE.y + STORAGE.h / 2;
  const outputY = OUTPUT.y + 70;
  const deviceRight = DEVICE_X + DEVICE_W;
  const bend = (deviceRight + MID_X) / 2;

  return (
    <svg
      viewBox="0 0 1000 480"
      role="img"
      aria-label="Each participant's browser records their camera and mic locally at full quality and uploads it in chunks to cloud storage, which is processed into a mixed recording and separate tracks. The live call runs separately through LiveKit and is never used for the recording."
      className="h-auto w-full min-w-[720px] text-foreground"
    >
      <defs>
        <marker
          id={`${id}-arrow`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0 0L10 5L0 10z" fill="currentColor" opacity={0.6} />
        </marker>
      </defs>

      {/* Live call: dashed, two-way, compressed. */}
      {devices.map(({ y }, i) => {
        const cy = y + DEVICE_H / 2;
        return (
          <path
            key={`live-${i}`}
            d={`M${deviceRight} ${cy} C${bend} ${cy} ${bend} ${liveY} ${MID_X} ${liveY}`}
            fill="none"
            className="stroke-foreground/30"
            strokeWidth={1.5}
            strokeDasharray="5 5"
          />
        );
      })}

      {/* Recording: solid, one-way, full quality, with chunks moving along. */}
      {devices.map(({ y }, i) => {
        const cy = y + DEVICE_H / 2;
        const d = `M${deviceRight} ${cy} C${bend} ${cy} ${bend} ${storageY} ${MID_X} ${storageY}`;
        return (
          <g key={`rec-${i}`}>
            <path
              id={`${id}-rec-${i}`}
              d={d}
              fill="none"
              className="stroke-foreground/60"
              strokeWidth={1.5}
              markerEnd={`url(#${id}-arrow)`}
            />
            {!reduceMotion &&
              [0, 1].map((n) => (
                <rect
                  key={n}
                  x={-5}
                  y={-3.5}
                  width={10}
                  height={7}
                  rx={2}
                  className="fill-blue-500"
                  opacity={0}
                >
                  <animateMotion
                    dur="2.4s"
                    begin={`${i * 0.4 + n * 1.2}s`}
                    repeatCount="indefinite"
                    rotate="auto"
                  >
                    <mpath href={`#${id}-rec-${i}`} />
                  </animateMotion>
                  <animate
                    attributeName="opacity"
                    values="0;1;1;0"
                    keyTimes="0;0.1;0.85;1"
                    dur="2.4s"
                    begin={`${i * 0.4 + n * 1.2}s`}
                    repeatCount="indefinite"
                  />
                </rect>
              ))}
          </g>
        );
      })}

      {/* Storage → finished recording. */}
      <path
        d={`M${MID_X + MID_W} ${storageY} C${(MID_X + MID_W + OUT_X) / 2} ${storageY} ${(MID_X + MID_W + OUT_X) / 2} ${outputY} ${OUT_X} ${outputY}`}
        fill="none"
        className="stroke-foreground/60"
        strokeWidth={1.5}
        markerEnd={`url(#${id}-arrow)`}
      />
      <text
        x={(MID_X + MID_W + OUT_X) / 2}
        y={Math.min(storageY, outputY) - 14}
        textAnchor="middle"
        className="fill-foreground/50 text-[12px]"
      >
        Processed
      </text>

      {/* Participants. */}
      {devices.map(({ initial, name, y }, i) => (
        <g key={`device-${i}`}>
          <Box x={DEVICE_X} y={y} w={DEVICE_W} h={DEVICE_H} />
          <circle
            cx={DEVICE_X + 28}
            cy={y + 28}
            r={13}
            className="fill-(--landing-chip)"
          />
          <text
            x={DEVICE_X + 28}
            y={y + 32.5}
            textAnchor="middle"
            className="fill-foreground text-[12px] font-semibold"
          >
            {initial}
          </text>
          <text
            x={DEVICE_X + 50}
            y={y + 33}
            className="fill-foreground text-[14px] font-semibold"
          >
            {name}
          </text>
          <rect
            x={DEVICE_X + DEVICE_W - 66}
            y={y + 17}
            width={50}
            height={22}
            rx={11}
            className="fill-red-500/12"
          />
          <circle
            cx={DEVICE_X + DEVICE_W - 52}
            cy={y + 28}
            r={3.5}
            className="fill-red-500"
          />
          <text
            x={DEVICE_X + DEVICE_W - 44}
            y={y + 32}
            className="fill-red-500 text-[11px] font-semibold"
          >
            REC
          </text>
          <text
            x={DEVICE_X + 16}
            y={y + 66}
            className="fill-foreground/75 text-[12.5px]"
          >
            Recorded in the browser
          </text>
          <text
            x={DEVICE_X + 16}
            y={y + 85}
            className="fill-foreground/50 text-[12px]"
          >
            Up to 4K video, 48kHz audio
          </text>
        </g>
      ))}

      {/* Live call server. */}
      <Box x={MID_X} y={LIVE.y} w={MID_W} h={LIVE.h} />
      <text
        x={MID_X + 18}
        y={LIVE.y + 32}
        className="fill-foreground text-[14px] font-semibold"
      >
        Live call
      </text>
      <text
        x={MID_X + 18}
        y={LIVE.y + 56}
        className="fill-foreground/75 text-[12.5px]"
      >
        Compressed to fit your internet
      </text>
      <text
        x={MID_X + 18}
        y={LIVE.y + 76}
        className="fill-foreground/50 text-[12px]"
      >
        Never used for the recording
      </text>

      {/* Storage. */}
      <Box x={MID_X} y={STORAGE.y} w={MID_W} h={STORAGE.h} />
      <text
        x={MID_X + 18}
        y={STORAGE.y + 32}
        className="fill-foreground text-[14px] font-semibold"
      >
        Cloud storage
      </text>
      <text
        x={MID_X + 18}
        y={STORAGE.y + 56}
        className="fill-foreground/75 text-[12.5px]"
      >
        Full-quality chunks, as you go
      </text>
      <text
        x={MID_X + 18}
        y={STORAGE.y + 76}
        className="fill-foreground/50 text-[12px]"
      >
        Your own R2 bucket if self-hosted
      </text>

      {/* Finished recording. */}
      <Box x={OUT_X} y={OUTPUT.y} w={OUT_W} h={OUTPUT.h} />
      <text
        x={OUT_X + 18}
        y={OUTPUT.y + 32}
        className="fill-foreground text-[14px] font-semibold"
      >
        Your recording
      </text>
      {outputs.map((label, i) => {
        const cy = OUTPUT.y + 62 + i * 28;
        return (
          <g key={label}>
            <circle
              cx={OUT_X + 26}
              cy={cy - 4}
              r={8}
              className="fill-green-500/15"
            />
            <path
              d={`M${OUT_X + 22.5} ${cy - 4}l2.5 2.5l4.5 -5`}
              fill="none"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="stroke-green-600 dark:stroke-green-400"
            />
            <text
              x={OUT_X + 42}
              y={cy}
              className="fill-foreground/75 text-[12.5px]"
            >
              {label}
            </text>
          </g>
        );
      })}

      {/* Legend. */}
      <g transform="translate(20 445)">
        <line
          x1={0}
          y1={0}
          x2={32}
          y2={0}
          className="stroke-foreground/30"
          strokeWidth={1.5}
          strokeDasharray="5 5"
        />
        <text x={42} y={4} className="fill-foreground/60 text-[12px]">
          Live call: what you see and hear, quality varies
        </text>
        <line
          x1={390}
          y1={0}
          x2={422}
          y2={0}
          className="stroke-foreground/60"
          strokeWidth={1.5}
        />
        <rect
          x={401}
          y={-3.5}
          width={10}
          height={7}
          rx={2}
          className="fill-blue-500"
        />
        <text x={432} y={4} className="fill-foreground/60 text-[12px]">
          Recording: full quality, uploaded in small chunks
        </text>
      </g>
    </svg>
  );
};

export default HowItWorksDiagram;
