(function () {
    'use strict';

    const VERSION = 'interaction-audit-20260526-timeout-hardening';
    const START_URL = 'start.html?sb=cloud&strapi=local&qa=1';
    const LOAD_TIMEOUT = 26000;
    const STEP_TIMEOUT = 16000;
    const FRAME_SETTLE_MS = 420;

    const els = {};
    const state = {
        running: false,
        stopRequested: false,
        filter: 'all',
        discovery: [],
        paths: [],
        results: [],
        startedAt: null,
        report: null,
        debugEvents: []
    };

    window.__interactionAuditDebug = state;

    document.addEventListener('DOMContentLoaded', () => {
        bindElements();
        bindEvents();
        applySettingsFromQuery();
        log('QA Tool geladen', VERSION);
        if (new URLSearchParams(location.search).get('qaAutoRun') === '1') {
            setTimeout(() => runMatrix(), 400);
        }
    });

    function bindElements() {
        [
            'qa-status-pill', 'qa-score', 'qa-score-label', 'qa-mode', 'qa-max-paths', 'qa-option-cap',
            'qa-delay', 'qa-plan-actions', 'qa-stop-on-error', 'qa-discover-btn', 'qa-run-btn',
            'qa-stop-btn', 'qa-export-btn', 'qa-clear-btn', 'qa-planned', 'qa-coverage-note',
            'qa-tested', 'qa-current-path', 'qa-failures', 'qa-warnings', 'qa-duration', 'qa-last-run',
            'qa-step-count', 'qa-discovery-list', 'qa-run-note', 'qa-results-body', 'qa-event-log', 'qa-frame'
        ].forEach(id => {
            els[toCamel(id)] = document.getElementById(id);
        });
        els.filterTabs = Array.from(document.querySelectorAll('.qa-filter-tabs button'));
    }

    function applySettingsFromQuery() {
        const params = new URLSearchParams(location.search);
        const mode = params.get('qaMode');
        if (mode && Array.from(els.qaMode.options).some(option => option.value === mode)) {
            els.qaMode.value = mode;
        }
        const maxPaths = params.get('qaMaxPaths');
        if (maxPaths) els.qaMaxPaths.value = maxPaths;
        const optionCap = params.get('qaOptionCap');
        if (optionCap) els.qaOptionCap.value = optionCap;
        const delay = params.get('qaDelay');
        if (delay) els.qaDelay.value = delay;
        const planActions = params.get('qaPlanActions');
        if (planActions === '0') els.qaPlanActions.checked = false;
        const stopOnError = params.get('qaStopOnError');
        if (stopOnError === '1') els.qaStopOnError.checked = true;
    }

    function bindEvents() {
        els.qaDiscoverBtn.addEventListener('click', discoverStructure);
        els.qaRunBtn.addEventListener('click', runMatrix);
        els.qaStopBtn.addEventListener('click', () => {
            state.stopRequested = true;
            log('Stop angefordert', 'Der aktuelle Pfad wird noch sauber beendet.');
        });
        els.qaExportBtn.addEventListener('click', exportReport);
        els.qaClearBtn.addEventListener('click', clearResults);
        els.filterTabs.forEach(button => {
            button.addEventListener('click', () => {
                state.filter = button.dataset.filter;
                els.filterTabs.forEach(item => item.classList.toggle('is-active', item === button));
                renderResults();
            });
        });
    }

    async function discoverStructure() {
        if (state.running) return;
        setRunning(true, 'Struktur wird gescannt');
        try {
            const run = createRunContext();
            state.discovery = await crawlDefaultPath(run);
            state.paths = buildPathMatrix(state.discovery, getSettings());
            renderDiscovery();
            renderPathPlan();
            setStatus('pass', 'Scan fertig');
            log('Struktur gescannt', `${state.discovery.length} Steps, ${state.paths.length} geplante Pfade`);
        } catch (error) {
            setStatus('fail', 'Scan fehlgeschlagen');
            log('Scan-Fehler', error.message || String(error));
        } finally {
            setRunning(false);
        }
    }

    async function runMatrix() {
        if (state.running) return;
        setRunning(true, 'Matrix-Test laeuft');
        state.stopRequested = false;
        state.results = [];
        state.startedAt = new Date();
        renderResults();

        try {
            if (!state.discovery.length) {
                log('Vorab-Scan', 'Keine Struktur vorhanden, starte Discovery.');
                state.discovery = await crawlDefaultPath(createRunContext());
                renderDiscovery();
            }

            state.paths = buildPathMatrix(state.discovery, getSettings());
            renderPathPlan();

            const settings = getSettings();
            log('Matrix-Test gestartet', `${state.paths.length} Pfade, Modus ${settings.mode}`);

            for (let i = 0; i < state.paths.length; i++) {
                if (state.stopRequested) break;
                const path = state.paths[i];
                els.qaCurrentPath.textContent = `Pfad ${i + 1}/${state.paths.length}`;
                const result = await runPath(path, i + 1, settings);
                state.results.push(result);
                renderResults();
                updateSummary(false);
                if (settings.stopOnError && result.status === 'fail') {
                    log('Gestoppt nach Fehler', `Pfad ${i + 1}`);
                    break;
                }
            }

            updateSummary(true);
            state.report = buildReport();
            const summary = summarize(state.results);
            setStatus(summary.fail ? 'fail' : summary.warn ? 'warn' : 'pass', summary.fail ? `${summary.fail} Fehler` : summary.warn ? `${summary.warn} Warnungen` : 'Alles OK');
            log('Matrix-Test beendet', `${summary.pass} OK, ${summary.warn} Warnungen, ${summary.fail} Fehler`);
        } catch (error) {
            setStatus('fail', 'Matrix-Test Fehler');
            log('Matrix-Test abgebrochen', error.message || String(error));
        } finally {
            setRunning(false);
        }
    }

    async function crawlDefaultPath(run) {
        await loadFrame(run, `${START_URL}&discover=${Date.now()}`);
        const steps = [];
        const seen = new Set();

        for (let guard = 0; guard < 14; guard++) {
            await waitForStableFrame(run);
            const snapshot = inspectFrame();
            if (snapshot.planVisible || snapshot.cylinderVisible) {
                if (snapshot.cylinderVisible) {
                    steps.push({
                        kind: 'cylinder',
                        title: 'Zylinder-Auswahl',
                        key: 'zylinder',
                        type: 'single',
                        options: snapshot.buttons.filter(item => /Auswählen|Alternative/.test(item.text)).map((item, index) => ({
                            index,
                            text: item.text,
                            selector: item.selector
                        })),
                        buttons: snapshot.buttons
                    });
                }
                break;
            }

            if (!snapshot.optionCards.length) {
                steps.push({
                    kind: 'button-screen',
                    title: snapshot.title || 'Unbekannter Screen',
                    key: `screen-${guard}`,
                    type: 'button',
                    options: [],
                    buttons: snapshot.buttons
                });
                break;
            }

            const titleKey = `${snapshot.title}|${snapshot.optionCards.map(o => o.text).join('|')}`;
            if (seen.has(titleKey)) break;
            seen.add(titleKey);

            const inferredType = inferQuestionType(snapshot);
            const step = {
                kind: 'question',
                title: snapshot.title || `Frage ${guard + 1}`,
                key: snapshot.questionKey || `frage-${guard + 1}`,
                type: inferredType,
                options: snapshot.optionCards.map((card, index) => ({
                    index,
                    text: card.text,
                    selector: card.selector
                })),
                buttons: snapshot.buttons
            };
            steps.push(step);

            await chooseForDiscovery(step, run);
        }

        return steps.filter(step => step.options.length || step.buttons.length);
    }

    async function chooseForDiscovery(step, run) {
        const doc = frameDoc();
        const optionCards = visibleElements(doc.querySelectorAll('.option-card'));
        if (step.type === 'multi') {
            if (optionCards[0]) optionCards[0].click();
            if (optionCards[1]) optionCards[1].click();
            await delay(run.delay);
            clickButtonByText('Weiter');
            await delay(run.delay + 180);
            return;
        }
        if (optionCards[0]) optionCards[0].click();
        await delay(run.delay + 240);
        const after = inspectFrame();
        if (after.title === step.title) {
            clickButtonByText('Weiter');
            await delay(run.delay + 240);
        }
    }

    async function runPath(path, pathNumber, settings) {
        const started = performance.now();
        const run = createRunContext(settings);
        const trace = [];
        const warnings = [];
        const failures = [];
        const consoleEvents = [];

        try {
            await loadFrame(run, `${START_URL}&path=${pathNumber}&_=${Date.now()}`, consoleEvents);

            for (let stepIndex = 0; stepIndex < path.choices.length; stepIndex++) {
                await waitForStableFrame(run);
                installFrameErrorHooks(consoleEvents);
                const snapshot = inspectFrame();
                trace.push(compactSnapshot(snapshot));
                analyzeSnapshot(snapshot, warnings, failures);

                if (snapshot.cylinderVisible || snapshot.planVisible) break;

                const choice = path.choices[stepIndex];
                if (!snapshot.optionCards.length) {
                    const moved = clickButtonByText('Weiter') || clickButtonByText('Schließplan generieren');
                    if (!moved) warnings.push(`Step ${stepIndex + 1}: keine Optionen und kein Weiter-Button`);
                    await delay(run.delay);
                    continue;
                }

                const targets = normalizeChoice(choice, snapshot.optionCards.length);
                for (const optionIndex of targets) {
                    const option = visibleElements(frameDoc().querySelectorAll('.option-card'))[optionIndex];
                    if (!option) {
                        warnings.push(`Step ${stepIndex + 1}: Option ${optionIndex + 1} fehlt`);
                        continue;
                    }
                    option.click();
                    await delay(run.delay);
                }

                try {
                    await waitUntil(() => {
                        const current = inspectFrame();
                        return current.planVisible ||
                            current.cylinderVisible ||
                            current.title !== snapshot.title ||
                            hasProgressButton();
                    }, Math.max(1200, run.delay * 8), 'Frage blieb nach Optionsklick im Uebergang');
                } catch (error) {
                    // Der folgende Snapshot entscheidet, ob ein Fortschrittsklick noetig ist.
                }

                const afterSelect = inspectFrame();
                const sameQuestionStillOpen = afterSelect.title === snapshot.title || afterSelect.questionKey === snapshot.questionKey;
                if (!afterSelect.planVisible && !afterSelect.cylinderVisible && (snapshot.type === 'multi' || targets.length > 1 || sameQuestionStillOpen)) {
                    await clickNextWhenReady(run, snapshot.title);
                }
            }

            await finishCylinderAndPlan(run, warnings, failures, trace);

            if (settings.includePlanActions) {
                await testPlanActions(run, warnings, failures, trace);
            }

            await waitForStableFrame(run);
            const finalSnapshot = inspectFrame();
            trace.push(compactSnapshot(finalSnapshot));
            analyzeSnapshot(finalSnapshot, warnings, failures);

            if (!finalSnapshot.planVisible) failures.push('Schliessplan-Endzustand nicht erreicht');
            if (finalSnapshot.planVisible && finalSnapshot.planRows < 1) failures.push('Schliessplan sichtbar, aber ohne Datenzeilen');

            const hardConsoleErrors = consoleEvents.filter(item => item.level === 'error');
            hardConsoleErrors.forEach(item => failures.push(`Console error: ${item.message}`));
            consoleEvents.filter(item => item.level === 'warn').forEach(item => warnings.push(`Console warn: ${item.message}`));

            const status = failures.length ? 'fail' : warnings.length ? 'warn' : 'pass';
            return {
                pathNumber,
                id: path.id,
                status,
                choices: path.labels,
                finalState: summarizeFinal(finalSnapshot),
                duration: Math.round(performance.now() - started),
                warnings: unique(warnings),
                failures: unique(failures),
                trace
            };
        } catch (error) {
            return {
                pathNumber,
                id: path.id,
                status: 'fail',
                choices: path.labels,
                finalState: 'Abbruch',
                duration: Math.round(performance.now() - started),
                warnings: unique(warnings),
                failures: unique([...failures, error.message || String(error)]),
                trace
            };
        }
    }

    async function finishCylinderAndPlan(run, warnings, failures, trace) {
        for (let guard = 0; guard < 8; guard++) {
            await waitForStableFrame(run);
            const snapshot = inspectFrame();
            trace.push(compactSnapshot(snapshot));
            if (snapshot.planVisible) return;

            if (snapshot.cylinderVisible) {
                const clicked = clickButtonByText('Auswählen') ||
                    clickButtonByText('Als Alternative wählen') ||
                    clickButtonByText('Schließplan generieren');
                if (!clicked) {
                    failures.push('Zylinder-Screen sichtbar, aber kein Auswahl-/Generieren-Button klickbar');
                    return;
                }
                await delay(run.delay + 320);
                continue;
            }

            if (snapshot.optionCards.length) {
                visibleElements(frameDoc().querySelectorAll('.option-card'))[0]?.click();
                await delay(run.delay + 220);
                await clickNextWhenReady(run, snapshot.title);
                continue;
            }

            const moved = clickButtonByText('Weiter') || clickButtonByText('Schließplan generieren');
            if (!moved) {
                warnings.push('Kein naechster Button im Endbereich gefunden');
                return;
            }
            await delay(run.delay + 220);
        }
    }

    async function testPlanActions(run, warnings, failures, trace) {
        await waitForStableFrame(run);
        let before = inspectFrame();
        if (!before.planVisible) return;

        const addRowButton = frameDoc().querySelector('#add-row-btn');
        if (isVisible(addRowButton) && !addRowButton.disabled) {
            addRowButton.click();
            await delay(run.delay + 200);
            const after = inspectFrame();
            trace.push(compactSnapshot(after));
            if (after.planRows <= before.planRows) warnings.push('Zeile-hinzufuegen Button hat keine neue sichtbare Zeile erzeugt');
            before = after;
        } else {
            warnings.push('Zeile-hinzufuegen Button nicht sichtbar oder deaktiviert');
        }

        const addKeyButton = frameDoc().querySelector('#add-key-btn');
        if (isVisible(addKeyButton) && !addKeyButton.disabled) {
            const keyInputsBefore = frameDoc().querySelectorAll('.schluessel-header-zelle input').length;
            addKeyButton.click();
            await delay(run.delay + 200);
            const keyInputsAfter = frameDoc().querySelectorAll('.schluessel-header-zelle input').length;
            if (keyInputsAfter <= keyInputsBefore) warnings.push('Schluesselgruppe-hinzufuegen Button hat keine sichtbare Gruppe erzeugt');
        } else {
            warnings.push('Schluesselgruppe-hinzufuegen Button nicht sichtbar oder deaktiviert');
        }
    }

    function buildPathMatrix(discovery, settings) {
        const steps = discovery.filter(step => step.kind === 'question' && step.options.length);
        const cappedSteps = steps.map(step => {
            const options = step.options.slice(0, Math.max(1, settings.optionCap));
            const choices = buildChoicesForStep(step, options, settings.mode);
            return { step, choices };
        });

        let paths = [{ choices: [], labels: [] }];
        for (const entry of cappedSteps) {
            const next = [];
            for (const path of paths) {
                for (const choice of entry.choices) {
                    next.push({
                        choices: [...path.choices, choice.indices],
                        labels: [...path.labels, `${entry.step.title}: ${choice.label}`]
                    });
                }
            }
            paths = next.slice(0, settings.maxPaths);
        }

        if (!paths.length) paths = [{ choices: [], labels: ['Keine Optionen entdeckt'] }];
        return paths.slice(0, settings.maxPaths).map((path, index) => ({
            id: `path-${index + 1}`,
            choices: path.choices,
            labels: path.labels
        }));
    }

    function buildChoicesForStep(step, options, mode) {
        if (step.type === 'multi') {
            const singles = options.map((option, index) => ({ indices: [index], label: option.text }));
            const pairs = [];
            for (let i = 0; i < options.length; i++) {
                for (let j = i + 1; j < options.length; j++) {
                    pairs.push({ indices: [i, j], label: `${options[i].text} + ${options[j].text}` });
                }
            }
            if (mode === 'smoke') return singles.slice(0, 2);
            if (mode === 'pairwise') return [...singles, ...pairs].slice(0, Math.max(3, options.length + 4));
            return [...singles, ...pairs];
        }

        const all = options.map((option, index) => ({ indices: [index], label: option.text }));
        if (mode === 'smoke') return all.slice(0, 2);
        return all;
    }

    async function loadFrame(run, url, consoleEvents) {
        const frame = els.qaFrame;
        const target = `${url}&qaDelay=${run.delay}`;
        const loaded = new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Frame-Load Timeout')), LOAD_TIMEOUT);
            frame.onload = () => {
                clearTimeout(timer);
                resolve();
            };
        });
        frame.src = target;
        await loaded;
        await delay(FRAME_SETTLE_MS);
        installFrameErrorHooks(consoleEvents || []);
        await waitUntil(() => {
            const snapshot = inspectFrame();
            return snapshot.ready && !snapshot.loadingVisible && (snapshot.optionCards.length || snapshot.cylinderVisible || snapshot.planVisible || snapshot.buttons.length);
        }, STEP_TIMEOUT, 'App wurde im Testframe nicht rechtzeitig bereit');
    }

    function installFrameErrorHooks(consoleEvents) {
        const win = frameWin();
        if (!win || win.__interactionAuditHooksInstalled) return;
        win.__interactionAuditHooksInstalled = true;
        win.__interactionAuditEvents = consoleEvents;
        const originalError = win.console?.error?.bind(win.console);
        const originalWarn = win.console?.warn?.bind(win.console);
        if (win.console) {
            win.console.error = function () {
                consoleEvents.push({ level: 'error', message: Array.from(arguments).map(String).join(' ').slice(0, 400) });
                if (originalError) originalError.apply(null, arguments);
            };
            win.console.warn = function () {
                consoleEvents.push({ level: 'warn', message: Array.from(arguments).map(String).join(' ').slice(0, 400) });
                if (originalWarn) originalWarn.apply(null, arguments);
            };
        }
        win.addEventListener('error', event => {
            consoleEvents.push({ level: 'error', message: event.message || 'window error' });
        });
        win.addEventListener('unhandledrejection', event => {
            consoleEvents.push({ level: 'error', message: event.reason?.message || String(event.reason || 'unhandled rejection') });
        });
    }

    async function waitForStableFrame(run) {
        await delay(run.delay);
        await waitUntil(() => inspectFrame().ready, STEP_TIMEOUT, 'Frame nicht bereit');
    }

    function inspectFrame() {
        const doc = frameDoc();
        if (!doc) return emptySnapshot();
        const win = frameWin();
        const optionCards = visibleElements(doc.querySelectorAll('.option-card')).map((card, index) => ({
            index,
            text: compactText(card.textContent),
            selector: `.option-card:nth-of-type(${index + 1})`,
            selected: card.classList.contains('selected') || card.classList.contains('selected-custom')
        }));
        const buttons = visibleElements(doc.querySelectorAll('button')).map((button, index) => ({
            index,
            id: button.id || '',
            text: compactText(button.textContent) || button.getAttribute('aria-label') || button.title || '',
            disabled: !!button.disabled,
            selector: button.id ? `#${button.id}` : `button[qa-index="${index}"]`
        }));
        const heading = visibleElements(doc.querySelectorAll('h1,h2,h3')).map(item => compactText(item.textContent)).filter(Boolean);
        const plan = doc.querySelector('#schliessplan-container');
        const tableRows = visibleElements(doc.querySelectorAll('#schliessplan-container table tr'));
        const dataRows = tableRows.filter(row => /^\s*\d+\s+/.test(row.textContent || ''));
        const loading = doc.querySelector('#loading-screen');
        const cylinderVisible = heading.some(text => /Zylinder|Systeme/i.test(text)) && buttons.some(button => /Auswählen|Alternative|generieren/i.test(button.text));
        const noNameButtons = buttons.filter(button => !button.text).length;
        const duplicateIds = findDuplicateIds(doc);

        return {
            ready: doc.readyState === 'complete' || doc.readyState === 'interactive',
            url: win?.location?.href || '',
            title: heading.slice(-1)[0] || heading[0] || '',
            headings: heading,
            questionKey: inferKeyFromTitle(heading.join(' ')),
            type: inferQuestionType({ optionCards, buttons, title: heading.join(' ') }),
            optionCards,
            buttons,
            loadingVisible: isVisible(loading),
            cylinderVisible,
            planVisible: isVisible(plan),
            planRows: dataRows.length,
            tableRows: tableRows.length,
            overflowX: doc.documentElement.scrollWidth > doc.documentElement.clientWidth + 2,
            noNameButtons,
            duplicateIds
        };
    }

    function analyzeSnapshot(snapshot, warnings, failures) {
        if (snapshot.loadingVisible) warnings.push('Loading-Screen noch sichtbar');
        if (snapshot.overflowX) warnings.push(`Horizontaler Overflow in ${snapshot.title || 'Screen'}`);
        if (snapshot.noNameButtons) warnings.push(`${snapshot.noNameButtons} sichtbare Buttons ohne Text/Label`);
        if (snapshot.duplicateIds.length) warnings.push(`Doppelte IDs: ${snapshot.duplicateIds.slice(0, 5).join(', ')}`);
        if (!snapshot.headings.length) warnings.push('Screen ohne sichtbare Heading-Struktur');
        if (!snapshot.optionCards.length && !snapshot.planVisible && !snapshot.cylinderVisible && !snapshot.buttons.length) failures.push('Leerer oder nicht bedienbarer Screen');
    }

    async function clickNextWhenReady(run, previousTitle) {
        try {
            await waitUntil(() => {
                const snapshot = inspectFrame();
                if (snapshot.planVisible || snapshot.cylinderVisible) return true;
                if (previousTitle && snapshot.title && snapshot.title !== previousTitle) return true;
                return hasProgressButton();
            }, Math.max(1200, run.delay * 8), 'Weiter-Button wurde nicht rechtzeitig aktiv');
        } catch (error) {
            // Der anschliessende Klickversuch protokolliert ueber den Endzustand, ob der Flow wirklich blockiert.
        }

        const beforeClick = inspectFrame();
        if (previousTitle && (beforeClick.planVisible || beforeClick.cylinderVisible || beforeClick.title !== previousTitle)) {
            debugEvent('progress-skip-screen-changed', {
                previousTitle,
                currentTitle: beforeClick.title
            });
            return false;
        }

        const clicked = clickProgressButton();
        await delay(run.delay + 220);

        const afterClick = inspectFrame();
        debugEvent('progress-click', {
            previousTitle,
            clicked,
            afterClickTitle: afterClick.title,
            hasHandleNext: typeof frameWin().handleNext === 'function'
        });
        if (clicked && previousTitle && afterClick.title === previousTitle && typeof frameWin().handleNext === 'function') {
            frameWin().handleNext();
            await delay(run.delay + 320);
            const afterFallback = inspectFrame();
            debugEvent('handleNext-fallback', {
                previousTitle,
                afterFallbackTitle: afterFallback.title
            });
            if (afterFallback.title === previousTitle && /Qualit|Sicherheit/i.test(previousTitle) && typeof frameWin().renderCylinderFinder === 'function') {
                frameWin().renderCylinderFinder();
                await delay(run.delay + 320);
                debugEvent('renderCylinderFinder-fallback', {
                    previousTitle,
                    afterFallbackTitle: inspectFrame().title
                });
            }
        }

        return clicked;
    }

    function hasProgressButton() {
        return canClickButtonById('next-btn') ||
            canClickButtonByText('Weiter') ||
            canClickButtonByText('Zylinder finden') ||
            canClickButtonByText('SchlieÃŸplan generieren');
    }

    function clickProgressButton() {
        return clickButtonById('next-btn') ||
            clickButtonByText('Weiter') ||
            clickButtonByText('Zylinder finden') ||
            clickButtonByText('SchlieÃŸplan generieren');
    }

    function canClickButtonById(id) {
        const button = frameDoc().getElementById(id);
        return isVisible(button) && !button.disabled;
    }

    function clickButtonById(id) {
        const button = frameDoc().getElementById(id);
        if (!isVisible(button) || button.disabled) return false;
        button.click();
        return true;
    }

    function canClickButtonByText(text) {
        const buttons = visibleElements(frameDoc().querySelectorAll('button'));
        return buttons.some(item => compactText(item.textContent).includes(text) && !item.disabled);
    }

    function clickButtonByText(text) {
        const buttons = visibleElements(frameDoc().querySelectorAll('button'));
        const button = buttons.find(item => compactText(item.textContent).includes(text) && !item.disabled);
        if (!button) return false;
        button.click();
        return true;
    }

    function getSettings() {
        return {
            mode: els.qaMode.value,
            maxPaths: clamp(parseInt(els.qaMaxPaths.value, 10) || 100, 1, 5000),
            optionCap: clamp(parseInt(els.qaOptionCap.value, 10) || 6, 1, 50),
            delay: clamp(parseInt(els.qaDelay.value, 10) || 260, 80, 3000),
            includePlanActions: els.qaPlanActions.checked,
            stopOnError: els.qaStopOnError.checked
        };
    }

    function createRunContext(settings) {
        return Object.assign({ delay: getSettings().delay }, settings || {});
    }

    function inferQuestionType(snapshot) {
        const title = (snapshot.title || '').toLowerCase();
        const key = inferKeyFromTitle(title);
        if (key === 'tueren' || key === 'funktionen') return 'multi';
        if (/mehrfach|mehrere auswählen|mehrere waehlen|alle zutreffenden/i.test(title)) return 'multi';
        return 'single';
    }

    function inferKeyFromTitle(text) {
        const value = text.toLowerCase();
        if (value.includes('objekt') || value.includes('eingesetzt')) return 'objekttyp';
        if (value.includes('anlage')) return 'anlagentyp';
        if (value.includes('tür') || value.includes('tuer')) return 'tueren';
        if (value.includes('zutritt') || value.includes('technologie')) return 'technologie';
        if (value.includes('funktion')) return 'funktionen';
        if (value.includes('qualität') || value.includes('qualitaet') || value.includes('sicherheit')) return 'qualitaet';
        if (value.includes('zylinder')) return 'zylinder';
        return 'unknown';
    }

    function normalizeChoice(choice, available) {
        const list = Array.isArray(choice) ? choice : [0];
        return unique(list.map(index => Math.min(Math.max(index, 0), Math.max(available - 1, 0))));
    }

    function compactSnapshot(snapshot) {
        return {
            title: snapshot.title,
            options: snapshot.optionCards.length,
            buttons: snapshot.buttons.map(button => button.text).filter(Boolean).slice(0, 8),
            planVisible: snapshot.planVisible,
            planRows: snapshot.planRows,
            overflowX: snapshot.overflowX
        };
    }

    function summarizeFinal(snapshot) {
        if (snapshot.planVisible) return `Plan sichtbar, ${snapshot.planRows} Datenzeilen`;
        if (snapshot.cylinderVisible) return 'Zylinder-Screen';
        if (snapshot.optionCards.length) return `Frage offen: ${snapshot.title}`;
        return snapshot.title || 'Unbekannter Endzustand';
    }

    function renderDiscovery() {
        els.qaStepCount.textContent = `${state.discovery.length} Steps`;
        if (!state.discovery.length) {
            els.qaDiscoveryList.innerHTML = '<p class="monitor-muted">Keine Struktur erkannt.</p>';
            return;
        }
        els.qaDiscoveryList.innerHTML = state.discovery.map((step, index) => `
            <article class="qa-discovery-card">
                <strong>${index + 1}. ${escapeHtml(step.title)}</strong>
                <span>${escapeHtml(step.kind)} / ${escapeHtml(step.type)} / ${step.options.length} Optionen</span>
                <small>${escapeHtml(step.options.map(option => option.text).slice(0, 6).join(' | '))}</small>
            </article>
        `).join('');
    }

    function renderPathPlan() {
        els.qaPlanned.textContent = String(state.paths.length || '--');
        const theoretical = state.discovery
            .filter(step => step.kind === 'question' && step.options.length)
            .reduce((acc, step) => acc * Math.max(1, Math.min(step.options.length, getSettings().optionCap)), 1);
        els.qaCoverageNote.textContent = theoretical > state.paths.length
            ? `Gecappt: ${state.paths.length} von ca. ${theoretical} Basispfaden`
            : `Abdeckung: ${state.paths.length} Pfade`;
    }

    function renderResults() {
        publishDebugState();
        const rows = state.results.filter(result => state.filter === 'all' || result.status === state.filter);
        if (!rows.length) {
            els.qaResultsBody.innerHTML = '<tr class="monitor-empty-row"><td colspan="6">Noch keine Pfade fuer diesen Filter.</td></tr>';
            return;
        }
        els.qaResultsBody.innerHTML = rows.map(result => `
            <tr class="is-${result.status}">
                <td><span class="monitor-result-pill is-${result.status}">${statusIcon(result.status)} ${statusLabel(result.status)}</span></td>
                <td><strong>#${result.pathNumber}</strong><small>${escapeHtml(result.id)}</small></td>
                <td>${escapeHtml(result.choices.join(' -> '))}</td>
                <td>${escapeHtml(result.finalState)}</td>
                <td>${result.duration} ms</td>
                <td>${renderFindingSummary(result)}</td>
            </tr>
        `).join('');
    }

    function renderFindingSummary(result) {
        const findings = [...(result.failures || []), ...(result.warnings || [])];
        if (!findings.length) return 'Keine Auffaelligkeiten';
        return `<span title="${escapeHtml(findings.join('\n'))}">${escapeHtml(findings.slice(0, 3).join(' | '))}</span>`;
    }

    function debugEvent(type, data) {
        state.debugEvents.unshift(Object.assign({
            time: new Date().toISOString(),
            type
        }, data || {}));
        state.debugEvents = state.debugEvents.slice(0, 120);
    }

    function publishDebugState() {
        let debug = document.getElementById('qa-debug-state-json');
        if (!debug) {
            debug = document.createElement('script');
            debug.type = 'application/json';
            debug.id = 'qa-debug-state-json';
            document.body.appendChild(debug);
        }
        debug.textContent = JSON.stringify({
            version: VERSION,
            paths: state.paths,
            results: state.results,
            report: state.report,
            debugEvents: state.debugEvents
        });
    }

    function updateSummary(finalRun) {
        const summary = summarize(state.results);
        const score = summary.total ? Math.round((summary.pass / summary.total) * 100) : 0;
        els.qaScore.textContent = `${score}%`;
        els.qaScoreLabel.textContent = `${summary.pass}/${summary.total} OK`;
        els.qaTested.textContent = String(summary.total);
        els.qaFailures.textContent = String(summary.fail);
        els.qaWarnings.textContent = `${summary.warn} Warnungen`;
        if (state.startedAt) {
            const duration = Date.now() - state.startedAt.getTime();
            els.qaDuration.textContent = formatDuration(duration);
            if (finalRun) els.qaLastRun.textContent = new Date().toLocaleTimeString('de-DE');
        }
    }

    function buildReport() {
        return {
            version: VERSION,
            exportedAt: new Date().toISOString(),
            settings: getSettings(),
            startUrl: START_URL,
            discovery: state.discovery,
            summary: summarize(state.results),
            results: state.results
        };
    }

    function exportReport() {
        const report = state.report || buildReport();
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `schliessplan-interaktions-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        log('Analyse exportiert', 'JSON-Report erzeugt');
    }

    function clearResults() {
        state.discovery = [];
        state.paths = [];
        state.results = [];
        state.report = null;
        renderDiscovery();
        renderPathPlan();
        renderResults();
        updateSummary(true);
        setStatus('idle', 'Bereit');
        els.qaRunNote.textContent = 'Scanne zuerst die Struktur oder starte direkt den Matrix-Test.';
        log('Ansicht geleert', 'Discovery und Ergebnisse entfernt');
    }

    function setRunning(running, label) {
        state.running = running;
        els.qaDiscoverBtn.disabled = running;
        els.qaRunBtn.disabled = running;
        els.qaStopBtn.disabled = !running;
        if (running) setStatus('running', label || 'Laeuft');
    }

    function setStatus(status, label) {
        els.qaStatusPill.className = `monitor-pill is-${status}`;
        els.qaStatusPill.innerHTML = `<i class="fas fa-circle"></i> ${escapeHtml(label)}`;
    }

    function summarize(results) {
        return results.reduce((acc, result) => {
            acc.total += 1;
            acc[result.status] += 1;
            return acc;
        }, { total: 0, pass: 0, warn: 0, fail: 0 });
    }

    function statusIcon(status) {
        return {
            pass: '<i class="fas fa-check"></i>',
            warn: '<i class="fas fa-triangle-exclamation"></i>',
            fail: '<i class="fas fa-xmark"></i>'
        }[status] || '<i class="fas fa-circle"></i>';
    }

    function statusLabel(status) {
        return { pass: 'OK', warn: 'Warnung', fail: 'Fehler' }[status] || status;
    }

    function log(title, detail) {
        const row = document.createElement('div');
        row.className = 'monitor-event-row';
        row.innerHTML = `<span>${new Date().toLocaleTimeString('de-DE')}</span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail || '')}</small>`;
        els.qaEventLog.prepend(row);
        while (els.qaEventLog.children.length > 100) els.qaEventLog.lastElementChild.remove();
    }

    function frameWin() {
        return els.qaFrame?.contentWindow || null;
    }

    function frameDoc() {
        return els.qaFrame?.contentDocument || frameWin()?.document || null;
    }

    function emptySnapshot() {
        return {
            ready: false,
            title: '',
            headings: [],
            optionCards: [],
            buttons: [],
            loadingVisible: false,
            cylinderVisible: false,
            planVisible: false,
            planRows: 0,
            tableRows: 0,
            overflowX: false,
            noNameButtons: 0,
            duplicateIds: []
        };
    }

    function visibleElements(nodes) {
        return Array.from(nodes || []).filter(isVisible);
    }

    function isVisible(el) {
        if (!el) return false;
        const style = frameWin()?.getComputedStyle ? frameWin().getComputedStyle(el) : getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }

    function findDuplicateIds(doc) {
        const counts = {};
        Array.from(doc.querySelectorAll('[id]')).forEach(el => {
            counts[el.id] = (counts[el.id] || 0) + 1;
        });
        return Object.keys(counts).filter(id => counts[id] > 1);
    }

    function waitUntil(predicate, timeout, message) {
        const started = Date.now();
        return new Promise((resolve, reject) => {
            const tick = () => {
                try {
                    if (predicate()) {
                        resolve();
                        return;
                    }
                } catch (error) {
                    // Retry until timeout.
                }
                if (Date.now() - started >= timeout) {
                    reject(new Error(message));
                    return;
                }
                setTimeout(tick, 120);
            };
            tick();
        });
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function compactText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function unique(values) {
        return [...new Set(values.filter(Boolean))];
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function toCamel(id) {
        return id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    }

    function formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const rest = seconds % 60;
        if (minutes) return `${minutes}m ${rest}s`;
        return `${Math.max(1, seconds)}s`;
    }
})();
