import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, HostListener, output, signal, viewChild } from '@angular/core';

@Component({
  selector: 'lcm-delivery-signature-pad', standalone: true,
  template: `<div class="signature"><canvas #canvas aria-label="Área para firma manuscrita" (pointerdown)="start($event)" (pointermove)="move($event)" (pointerup)="stop()" (pointercancel)="stop()"></canvas>@if(!hasInk()){<span>Firme aquí</span>}</div><button type="button" class="clear" (click)="clear()">Limpiar firma</button>`,
  styles: [`.signature{position:relative;min-height:180px;border:2px dashed var(--border-control);border-radius:12px;background:var(--surface);overflow:hidden}.signature:focus-within{outline:3px solid var(--construction-focus)}canvas{display:block;width:100%;height:180px;touch-action:none}.signature span{position:absolute;inset:0;display:grid;place-items:center;color:var(--text-muted);pointer-events:none}.clear{min-height:44px;margin-top:.5rem;background:var(--surface);border:1px solid var(--border-control);border-radius:8px;padding:.6rem 1rem}`],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeliverySignaturePadComponent implements AfterViewInit {
  readonly signature = output<Blob>(); readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas'); readonly hasInk = signal(false); private drawing = false; private context?: CanvasRenderingContext2D;
  ngAfterViewInit() { this.resize(); }
  @HostListener('window:resize') resize() { const canvas=this.canvas().nativeElement; const rect=canvas.getBoundingClientRect(); const ratio=window.devicePixelRatio||1; if(!rect.width)return; canvas.width=Math.round(rect.width*ratio);canvas.height=Math.round(180*ratio);this.context=canvas.getContext('2d')??undefined;if(this.context){this.context.scale(ratio,ratio);this.context.lineWidth=2.5;this.context.lineCap='round';this.context.strokeStyle='#111827';} }
  start(event:PointerEvent){this.drawing=true;this.hasInk.set(true);this.canvas().nativeElement.setPointerCapture(event.pointerId);const p=this.point(event);this.context?.beginPath();this.context?.moveTo(p.x,p.y);}
  move(event:PointerEvent){if(!this.drawing||!this.context)return;const p=this.point(event);this.context.lineTo(p.x,p.y);this.context.stroke();}
  stop(){if(!this.drawing)return;this.drawing=false;this.canvas().nativeElement.toBlob(blob=>{if(blob)this.signature.emit(blob);},'image/png');}
  clear(){const canvas=this.canvas().nativeElement;this.context?.clearRect(0,0,canvas.width,canvas.height);this.hasInk.set(false);}
  toBlob(){return new Promise<Blob|null>(resolve=>this.hasInk()?this.canvas().nativeElement.toBlob(resolve,'image/png'):resolve(null));}
  private point(event:PointerEvent){const rect=this.canvas().nativeElement.getBoundingClientRect();return{x:event.clientX-rect.left,y:event.clientY-rect.top};}
}
