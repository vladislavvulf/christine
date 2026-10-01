'use client';
// Иконки интерфейса — Phosphor Icons (MIT), иллюстрации — Microsoft Fluent 3D (MIT), персонажи — Avataaars.
import { BASE } from '@/lib/util';

export {
  ArrowClockwise, ArrowLeft, BookOpenText, CaretRight, Check, CheckCircle, Clock, CloudArrowUp, Crown, FastForward,
  FilmSlate, Fire, GameController, Gear, Gift, GoogleLogo, Heart, Lightbulb, Lock, MapTrifold, Medal, Microphone,
  MoonStars, Pause, Play, Repeat, SignOut, SpeakerHigh, Star, Sun, Target, TextAa, Timer, Translate, Trophy, User,
  X, XCircle, Lightning, Eye, EyeSlash, Subtitles, SkipBack, SkipForward, Gauge, Sparkle, ChatCircleDots, Brain,
  Books, PencilSimple, Copy, Plus, Trash,
} from '@phosphor-icons/react';

/** 3D-иллюстрация из public/img/3d */
export function Pic({ name, size = 48, className = '', alt = '' }: { name: string; size?: number; className?: string; alt?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`${BASE}/img/3d/${name}.webp`} width={size} height={size} alt={alt} className={`pic ${className}`} draggable={false} loading="lazy" decoding="async" />
  );
}

/** Персонаж мини-сцены */
export function CastFace({ id, size = 48 }: { id: string; size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`${BASE}/img/cast/${id}.svg`} width={size} height={size} alt="" className="cast-face" draggable={false} />;
}

/** Аватар пользователя: новые — ключ картинки (a_tiger), старые — эмодзи */
export function Avatar({ value, size = 40 }: { value?: string; size?: number }) {
  const v = value && value.startsWith('a_') ? value : 'a_tiger';
  return <Pic name={v} size={size} className="avatar-pic" />;
}
