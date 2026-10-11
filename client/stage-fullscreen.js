/* Fullscreen the complete stage, with a viewport-sized mobile fallback.
 * CSS owns stage layout; this controller owns mode, scroll lock and lifecycle.
 */
(() => {
  'use strict';
  const viewportProperties = ['--stage-viewport-width','--stage-viewport-height','--stage-viewport-top','--stage-viewport-left'];
  const saveStyle = (element, properties) => properties.map(name => ({element,name,value:element.style.getPropertyValue(name),priority:element.style.getPropertyPriority(name)}));
  const restoreStyle = records => records?.forEach(({element,name,value,priority}) => value ? element.style.setProperty(name,value,priority) : element.style.removeProperty(name));

  class StageFullscreen {
    constructor(stage, {onchange} = {}) {
      if (!stage?.ownerDocument) throw new TypeError('StageFullscreen needs a stage element.');
      this.stage=stage;this.document=stage.ownerDocument;this.window=this.document.defaultView;
      this.onchange=onchange;this._fallback=false;this._intent=false;this._destroyed=false;
      this._generation=0;this._request=null;this._lock=null;this._focusBefore=null;this._scrollBefore=null;this._viewportFrame=null;
      this._viewportStyle=saveStyle(stage,viewportProperties);this._nativeWasActive=this._nativeElement()===stage;
      this._nativeChange=()=>this._syncNative();
      this._viewportChange=()=>{
        if(this._destroyed||this._viewportFrame!==null)return;
        this._viewportFrame=this.window.requestAnimationFrame(()=>{
          this._viewportFrame=null;
          if(this._destroyed||!this.isActive())return;
          this._updateViewport();this._notify('viewport');
        });
      };
      this._escape=event=>{if(event.key==='Escape'&&this._fallback){event.preventDefault();void this.exit();}};
      this.document.addEventListener('fullscreenchange',this._nativeChange);
      this.document.addEventListener('webkitfullscreenchange',this._nativeChange);
      this.document.addEventListener('keydown',this._escape);
      this.window.addEventListener('resize',this._viewportChange,{passive:true});
      this.window.addEventListener('orientationchange',this._viewportChange,{passive:true});
      this.window.visualViewport?.addEventListener('resize',this._viewportChange,{passive:true});
      this.window.visualViewport?.addEventListener('scroll',this._viewportChange,{passive:true});
      this.window.screen?.orientation?.addEventListener('change',this._viewportChange);
      if(this._nativeWasActive){this._intent=true;this._updateViewport();}
    }

    _nativeElement() {return this.document.fullscreenElement||this.document.webkitFullscreenElement||null;}
    isFallback() {return this._fallback;}
    isActive() {return this._fallback||this._nativeElement()===this.stage;}
    _notify(reason) {
      if(this._destroyed)return;
      this.onchange?.({active:this.isActive(),native:this._nativeElement()===this.stage,fallback:this._fallback,reason});
    }
    _updateViewport() {
      const vv=this.window.visualViewport,w=this.window;
      const dimension=(value,fallback)=>Number.isFinite(value)&&value>0?value:Math.max(1,fallback||1);
      const offset=value=>Number.isFinite(value)?Math.max(0,value):0;
      this.stage.style.setProperty('--stage-viewport-width',`${dimension(vv?.width,w.innerWidth)}px`);
      this.stage.style.setProperty('--stage-viewport-height',`${dimension(vv?.height,w.innerHeight)}px`);
      this.stage.style.setProperty('--stage-viewport-top',`${offset(vv?.offsetTop)}px`);
      this.stage.style.setProperty('--stage-viewport-left',`${offset(vv?.offsetLeft)}px`);
    }
    _rememberFocus() {
      if(!this._focusBefore){this._focusBefore=this.document.activeElement;this._scrollBefore={x:this.window.scrollX,y:this.window.scrollY};}
    }
    _restoreFocus() {
      const prior=this._focusBefore;this._focusBefore=null;
      if(this._scrollBefore){
        const behavior=saveStyle(this.document.documentElement,['scroll-behavior']);
        this.document.documentElement.style.setProperty('scroll-behavior','auto','important');
        this.window.scrollTo(this._scrollBefore.x,this._scrollBefore.y);restoreStyle(behavior);this._scrollBefore=null;
      }
      if(prior?.isConnected&&typeof prior.focus==='function'){
        const current=this.document.activeElement;
        if(current===this.document.body||current===this.document.documentElement||this.stage.contains(current)){
          try{prior.focus({preventScroll:true});}catch(_){/* Retain the current focus on older browsers. */}
        }
      }
    }
    _enterFallback() {
      if(this._fallback||this._destroyed||!this._intent)return;
      const body=this.document.body,html=this.document.documentElement;
      const bodyProperties=['position','top','left','width','overflow','overscroll-behavior'];
      const htmlProperties=['overflow','overscroll-behavior','scroll-behavior'];
      this._lock={x:this.window.scrollX,y:this.window.scrollY,styles:[...saveStyle(body,bodyProperties),...saveStyle(html,htmlProperties)],stageClass:this.stage.classList.contains('immersive'),bodyClass:body.classList.contains('stage-immersive')};
      this._fallback=true;
      this.stage.classList.add('immersive');body.classList.add('stage-immersive');
      body.style.setProperty('position','fixed','important');
      body.style.setProperty('top',`${-this._lock.y}px`,'important');
      body.style.setProperty('left',`${-this._lock.x}px`,'important');
      body.style.setProperty('width','100%','important');
      body.style.setProperty('overflow','hidden','important');body.style.setProperty('overscroll-behavior','none','important');
      html.style.setProperty('overflow','hidden','important');html.style.setProperty('overscroll-behavior','none','important');
      this._updateViewport();this._notify('fallback-enter');
    }
    _leaveFallback() {
      if(!this._fallback)return;
      const lock=this._lock;this._fallback=false;this._lock=null;
      this.stage.classList.toggle('immersive',!!lock?.stageClass);
      this.document.body.classList.toggle('stage-immersive',!!lock?.bodyClass);
      if(lock){
        const behavior=lock.styles.filter(p=>p.name==='scroll-behavior');
        restoreStyle(lock.styles.filter(p=>p.name!=='scroll-behavior'));
        this.document.documentElement.style.setProperty('scroll-behavior','auto','important');
        this.window.scrollTo(lock.x,lock.y);restoreStyle(behavior);
      }
    }
    _waitNative(milliseconds=350) {
      if(this._nativeElement()===this.stage)return Promise.resolve(true);
      return new Promise(resolve=>{
        let timer;
        const done=()=>{clearTimeout(timer);this.document.removeEventListener('fullscreenchange',changed);this.document.removeEventListener('webkitfullscreenchange',changed);resolve(this._nativeElement()===this.stage);};
        const changed=()=>{if(this._nativeElement()===this.stage)done();};
        this.document.addEventListener('fullscreenchange',changed);this.document.addEventListener('webkitfullscreenchange',changed);
        timer=setTimeout(done,milliseconds);
      });
    }
    async _exitNative() {
      if(this._nativeElement()!==this.stage)return;
      const prefixed=this.document.webkitExitFullscreen||this.document.webkitCancelFullScreen;
      const exit=this.document.fullscreenElement===this.stage?this.document.exitFullscreen||prefixed:prefixed||this.document.exitFullscreen;
      if(typeof exit!=='function')return;
      let timer;
      try{await Promise.race([Promise.resolve(exit.call(this.document)),new Promise(resolve=>{timer=setTimeout(resolve,1500);})]);}
      catch(_){/* Native Escape and the exit control stay available. */}
      finally{clearTimeout(timer);}
    }
    _syncNative() {
      const native=this._nativeElement()===this.stage;
      if(native){
        if(!this._intent||this._destroyed){void this._exitNative();return;}
        this._leaveFallback();this._nativeWasActive=true;this._updateViewport();this._notify('native-enter');
      }else if(this._nativeWasActive){
        this._nativeWasActive=false;this._intent=false;this._generation++;
        this._leaveFallback();restoreStyle(this._viewportStyle);this._restoreFocus();this._notify('native-exit');
      }
    }

    enter() {
      if(this._destroyed)return Promise.resolve(false);
      if(this.isActive())return Promise.resolve(true);
      if(this._request)return this._request;
      this._intent=true;const generation=++this._generation;this._rememberFocus();this._updateViewport();
      const standard=this.stage.requestFullscreen,prefixed=this.stage.webkitRequestFullscreen||this.stage.webkitRequestFullScreen;
      const request=standard||prefixed;
      const supported=typeof request==='function'&&(standard?this.document.fullscreenEnabled!==false:this.document.webkitFullscreenEnabled!==false);
      // Call native fullscreen before the first await to retain button activation.
      let nativeRequest;
      try{if(supported)nativeRequest=Promise.resolve(standard?request.call(this.stage,{navigationUI:'hide'}):request.call(this.stage));}
      catch(_){nativeRequest=null;}
      if(nativeRequest)nativeRequest.then(()=>{if(!this._intent||this._destroyed)void this._exitNative();},()=>{});
      const operation=(async()=>{
        let timer,rejected=false;
        if(nativeRequest){
          try{await Promise.race([nativeRequest,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Fullscreen transition timed out.')),1500);})]);}
          catch(_){rejected=true;/* Rejected native fullscreen uses the complete stage fallback. */}
          finally{clearTimeout(timer);}
          if(!rejected&&!this._destroyed&&this._intent&&generation===this._generation&&!this.isActive())await this._waitNative();
        }
        if(this._destroyed||!this._intent||generation!==this._generation){if(!this._intent)await this._exitNative();return false;}
        if(this._nativeElement()===this.stage){this._nativeWasActive=true;this._updateViewport();this._notify('native-enter');}
        else this._enterFallback();
        return this.isActive();
      })();
      this._request=operation;
      operation.finally(()=>{if(this._request===operation)this._request=null;});
      return operation;
    }
    async exit() {
      this._intent=false;this._generation++;this._request=null;
      this._leaveFallback();await this._exitNative();
      if(!this.isActive()){this._nativeWasActive=false;restoreStyle(this._viewportStyle);this._restoreFocus();}
      this._notify('exit');return !this.isActive();
    }
    toggle() {return this.isActive()||this._intent?this.exit():this.enter();}
    async destroy() {
      if(this._destroyed)return;
      this._destroyed=true;
      await this.exit();
      this.document.removeEventListener('fullscreenchange',this._nativeChange);
      this.document.removeEventListener('webkitfullscreenchange',this._nativeChange);
      this.document.removeEventListener('keydown',this._escape);
      this.window.removeEventListener('resize',this._viewportChange);
      this.window.removeEventListener('orientationchange',this._viewportChange);
      this.window.visualViewport?.removeEventListener('resize',this._viewportChange);
      this.window.visualViewport?.removeEventListener('scroll',this._viewportChange);
      this.window.screen?.orientation?.removeEventListener('change',this._viewportChange);
      if(this._viewportFrame!==null)this.window.cancelAnimationFrame(this._viewportFrame);
      this._viewportFrame=null;restoreStyle(this._viewportStyle);
    }
  }
  window.StageFullscreen=StageFullscreen;
})();
