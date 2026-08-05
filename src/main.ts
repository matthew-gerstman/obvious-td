// Entry point — game logic will be added in later work items.
// WI-0 establishes the scaffold only.

const canvas = document.getElementById('game') as HTMLCanvasElement | null;

if (canvas) {
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#e0e0e0';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText("Don't Let the Demons Into Heaven", canvas.width / 2, canvas.height / 2);
  }
}

