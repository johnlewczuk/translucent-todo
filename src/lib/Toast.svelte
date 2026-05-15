<script lang="ts">
  import { toasts } from "./stores";
</script>

<div class="toast-stack">
  {#each $toasts as t (t.id)}
    <div class="toast">{t.text}</div>
  {/each}
</div>

<style>
  .toast-stack {
    position: absolute;
    bottom: 12px;
    left: 12px;
    right: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    pointer-events: none;
  }
  .toast {
    background: rgba(20, 22, 30, 0.85);
    color: white;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    font-size: 12px;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }
</style>
