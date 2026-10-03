"""Verifica o novo catálogo GLB/PBR no Chrome: python scripts/verify-package.py."""
import functools
import http.server
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/'
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True, args=['--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width': 1440, 'height': 900})
        errors, failed = [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('requestfailed', lambda request: failed.append(request.url))
        page.route('https://fonts.googleapis.com/**', lambda route: route.fulfill(body='', content_type='text/css'))
        page.goto(url)
        page.wait_for_function('document.querySelector("#mainImage").naturalWidth > 0')
        page.evaluate('clearTimeout(state.autoplayTimer)')
        assert page.locator('.product-card').count() == 13
        assert page.locator('#setSelect option[value="SÉRIE ESPECIAL"]:disabled').count() == 1
        page.locator('#modelMode').click()
        page.wait_for_function('state.viewer?.loaded && state.viewer.ambiente && document.querySelector("#modelStage").getAttribute("aria-busy") === "false"', timeout=40000)
        assert page.locator('.component-card').count() == 12
        assert page.evaluate('state.viewer.bed.children.length === 3 && state.viewer.stage.children.length === 2')
        assert page.evaluate('state.viewer.parts.base.children.length > 0 && state.viewer.parts.colchao.children.length > 0')
        assert page.evaluate('''() => {
          let count = 0;
          state.viewer.bed.traverse(node => {
            if (!node.isMesh) return;
            count++;
            const material = Array.isArray(node.material) ? node.material[0] : node.material;
            if (material !== node.userData.originalMaterials[0] || !material.map) throw Error('Material PBR substituído');
          });
          return count > 10;
        }''')
        assert page.evaluate('state.viewer.ambientePath.includes("ambiente_01")')
        print('OK: primeira montagem usa 3 GLBs, 1 ambiente e materiais PBR originais.', flush=True)

        page.evaluate('window.first = {scene: state.viewer.scene, renderer: state.viewer.renderer, room: state.viewer.ambiente}')
        # Troca de ambiente descarrega o anterior; quarto/câmera/renderizador não duplicam.
        for index in ('1', '2', '0'):
            page.locator('#environmentSelect').select_option(index)
            page.wait_for_function(f'state.viewer.ambientePath.includes("ambiente_0{int(index)+1}")')
            assert page.evaluate('state.viewer.stage.children.length === 2')
            assert page.evaluate('state.viewer.scene === window.first.scene && state.viewer.renderer === window.first.renderer')
        print('OK: três ambientes trocados sem duplicar a cena.', flush=True)

        # Cada conjunto completo deve montar três peças independentes.
        names = page.locator('#setSelect option:not(:disabled)').evaluate_all('(items) => items.map(item => item.value)')
        for name in names:
            page.locator('#setSelect').select_option(name)
            page.wait_for_function('(name) => state.viewer.paths.base.includes(encodeURIComponent(name)) && document.querySelector("#modelStage").getAttribute("aria-busy") === "false"', arg=name, timeout=30000)
            assert page.evaluate('state.viewer.bed.children.length === 3')
            assert page.evaluate('''() => {
              for (const part of Object.values(state.viewer.parts)) {
                let found = false;
                part.traverse(node => { if (node.isMesh && node.material.map) found = true; });
                if (!found) return false;
              }
              return true;
            }''')
        assert len(names) == 12
        print('OK: 12 conjuntos completos carregados; texturas preservadas.', flush=True)

        # Escolha independente de cada peça e cor opcional sem remover mapas.
        page.locator('#setSelect').select_option('ADHARA')
        page.wait_for_function('state.viewer.paths.base.includes("ADHARA")')
        for tab, name in [('baseTab', 'AMORE'), ('mattressTab', 'ASTO'), ('headboardTab', 'AUSTIN')]:
            page.locator('#' + tab).click()
            page.locator(f'[data-option="{name}"]').click()
            page.wait_for_function('(name) => Object.values(state.configuration).includes(name) && document.querySelector("#modelStage").getAttribute("aria-busy") === "false"', arg=name)
        assert page.evaluate('JSON.stringify(state.configuration) === JSON.stringify({base:"AMORE",mattress:"ASTO",headboard:"AUSTIN"})')
        assert page.locator('#setSelect').input_value() == 'custom'
        assert page.evaluate('state.viewer.stage.children.length === 2 && state.viewer.bed.children.length === 3')
        assert page.evaluate('''() => {
          const bounds = state.viewer.parts.base.userData.originalBounds;
          const mattress = state.viewer.parts.colchao;
          const bottom = mattress.userData.originalBounds.min.z + mattress.position.z - mattress.userData.originalPosition.z;
          return Math.abs(bounds.max.z - bottom) < .00001;
        }''')
        page.locator('[data-fabric="base"][data-color="#69584c"]').click()
        assert page.evaluate('''() => {
          let ok = false;
          state.viewer.parts.base.traverse(node => {
            if (node.isMesh && node.material.map && node.material !== node.userData.originalMaterials[0]) ok = true;
          });
          return ok;
        }''')
        page.locator('[data-fabric="base"][data-color="original"]').click()
        assert page.evaluate('''() => {
          let ok = true;
          state.viewer.parts.base.traverse(node => {
            if (node.isMesh && node.material !== node.userData.originalMaterials[0]) ok = false;
          });
          return ok;
        }''')
        print('OK: mistura entre conjuntos; cor opcional e retorno ao material original.', flush=True)

        page.screenshot(path=str(ROOT / 'showroom-3d-preview.png'))
        page.set_viewport_size({'width': 390, 'height': 844})
        page.wait_for_timeout(350)
        assert page.locator('#sceneControls').is_visible()
        assert page.locator('#setSelect').is_visible()
        assert page.locator('#environmentSelect').is_visible()
        assert page.evaluate('Math.abs(state.viewer.camera.aspect - state.viewer.container.clientWidth / state.viewer.container.clientHeight) < .01')
        page.screenshot(path=str(ROOT / 'showroom-3d-mobile-preview.png'))
        page.set_viewport_size({'width': 1440, 'height': 900})
        page.locator('#photoMode').click()
        assert page.locator('.product-card').count() == 13
        page.locator('[data-index="9"]').click()
        page.wait_for_function('state.index === 9 && !state.animating')
        assert page.locator('#productName').inner_text() == 'SÉRIE ESPECIAL'
        assert not errors, errors
        assert not [request for request in failed if 'fonts.' not in request], failed
        browser.close()
        print('OK: encaixe, celular, fotos e SÉRIE ESPECIAL apenas como foto. Sem erros JS.', flush=True)
finally:
    server.shutdown()
