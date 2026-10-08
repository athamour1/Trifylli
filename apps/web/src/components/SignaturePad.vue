<template>
  <!--
    Υπογραφή με το δάχτυλο ή το ποντίκι. Το μοντέλο είναι data URL (PNG) ή κενό.
    Η ζωγραφιά δεν είναι το νομικό τεκμήριο — αυτό είναι το όνομα, η ρητή
    συναίνεση και η χρονοσήμανση. Μπαίνει επειδή «μοιάζει με έντυπο».
  -->
  <div>
    <div class="pad rounded-borders" :class="{ 'pad--filled': hasInk }">
      <canvas
        ref="canvas"
        :width="width"
        :height="height"
        @pointerdown="start"
        @pointermove="move"
        @pointerup="end"
        @pointercancel="end"
        @pointerleave="end"
      />
      <div v-if="!hasInk" class="pad__hint text-grey-5">Υπογράψτε εδώ</div>
    </div>
    <div class="row justify-end q-mt-xs">
      <q-btn flat dense size="sm" icon="backspace" label="Καθαρισμός" :disable="!hasInk" @click="clear" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';

const props = withDefaults(defineProps<{ modelValue: string; width?: number; height?: number }>(), {
  width: 480,
  height: 160,
});
const emit = defineEmits<{ 'update:modelValue': [string] }>();

const canvas = ref<HTMLCanvasElement | null>(null);
const hasInk = ref(false);
let ctx: CanvasRenderingContext2D | null = null;
let drawing = false;

onMounted(() => {
  ctx = canvas.value?.getContext('2d') ?? null;
  if (ctx) {
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a237e';
  }
});

function point(e: PointerEvent): { x: number; y: number } {
  const rect = canvas.value!.getBoundingClientRect();
  // Ο καμβάς μπορεί να έχει κλιμακωθεί από το CSS: μετατρέπουμε σε pixel του καμβά.
  return { x: ((e.clientX - rect.left) * props.width) / rect.width, y: ((e.clientY - rect.top) * props.height) / rect.height };
}

function start(e: PointerEvent): void {
  if (!ctx) return;
  drawing = true;
  canvas.value?.setPointerCapture(e.pointerId);
  const p = point(e);
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  e.preventDefault();
}

function move(e: PointerEvent): void {
  if (!drawing || !ctx) return;
  const p = point(e);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  hasInk.value = true;
  e.preventDefault();
}

function end(): void {
  if (!drawing) return;
  drawing = false;
  if (hasInk.value && canvas.value) emit('update:modelValue', canvas.value.toDataURL('image/png'));
}

function clear(): void {
  if (!ctx || !canvas.value) return;
  ctx.clearRect(0, 0, props.width, props.height);
  hasInk.value = false;
  emit('update:modelValue', '');
}
</script>

<style scoped>
.pad {
  position: relative;
  border: 1px dashed var(--line-strong);
  background: #fff;
  touch-action: none;
}
.pad--filled {
  border-style: solid;
}
.pad canvas {
  display: block;
  width: 100%;
  height: auto;
}
.pad__hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  font-size: 14px;
}
</style>
