"""One isolated publisher view. Selenium/Chromium are closed after every page."""
import json
import os
import sys
import tempfile
from urllib.parse import urlsplit,urlunsplit,parse_qsl,urlencode
from .browser_settle import PublisherSettle,settled_view
from .browser_controls import expand_groups

ERROR_EXIT_CODES={
    'TimeoutException':2,
    'WebDriverException':3,'SessionNotCreatedException':3,'NoSuchDriverException':3,
    'NoSuchElementException':5,'InvalidArgumentException':6,'JavascriptException':7,
    'FileNotFoundError':8,'KeyError':9,'PermissionError':10,'ValueError':11,
    'ElementClickInterceptedException':12,'StaleElementReferenceException':13,
}

def render(config):
    # Crashpad and Chromium require a writable home/cache even with a read-only
    # container root. Never reuse the operator's real home or browser profile.
    with tempfile.TemporaryDirectory(prefix='continua-browser-') as profile:
        return _render(config,profile)

def _render(config,profile):
    from selenium import webdriver
    from selenium.webdriver.chrome.service import Service
    from selenium.webdriver.common.by import By
    from selenium.webdriver.common.keys import Keys
    from selenium.webdriver.support.ui import WebDriverWait
    options=webdriver.ChromeOptions()
    options.binary_location=config['chromium']
    for flag in ['--headless=new','--disable-dev-shm-usage','--disable-background-networking','--disable-default-apps','--no-first-run','--renderer-process-limit=1','--js-flags=--max-old-space-size=64',f'--user-data-dir={profile}/profile',f"--user-agent={config['userAgent']}",f"--proxy-server=http://127.0.0.1:{config['proxyPort']}",'--proxy-bypass-list=<-loopback>']:
        options.add_argument(flag)
    if sys.platform.startswith('linux'):
        # Select the unprivileged user-namespace sandbox, not the legacy SUID
        # helper. The namespace and seccomp sandboxes remain enabled; hosts
        # that prohibit them must fail closed, never use --no-sandbox.
        options.add_argument('--disable-setuid-sandbox')
    # Chromium runs under the candidate container's non-root account. Do not
    # disable its sandbox or TLS verification to make a publisher page work.
    options.set_capability('pageLoadStrategy','eager')
    options.set_capability('goog:loggingPrefs',{'performance':'ALL'})
    options.add_experimental_option('prefs',{'profile.managed_default_content_settings.images':2,'profile.default_content_setting_values.notifications':2})
    environment={k:os.environ[k] for k in ('PATH','SystemRoot','WINDIR','TEMP','TMP') if k in os.environ}
    environment.update({'HOME':profile,'XDG_CACHE_HOME':profile+'/cache','XDG_CONFIG_HOME':profile+'/config'})
    service=Service(config['driver'],env=environment,log_output=os.devnull)
    driver=webdriver.Chrome(service=service,options=options)
    try:
        driver.set_page_load_timeout(30);driver.set_script_timeout(10)
        driver.execute_cdp_cmd('Network.enable',{})
        driver.execute_cdp_cmd('Network.setBypassServiceWorker',{'bypass':True})
        driver.execute_cdp_cmd('Network.setBlockedURLs',{'urls':['*.png','*.jpg','*.jpeg','*.gif','*.svg','*.woff','*.woff2','*.ttf','*.mp4','*.pdf']})
        selected=config['options'];parts=urlsplit(config['url'])
        query=[(k,v) for k,v in parse_qsl(parts.query,keep_blank_values=True) if not (selected.get('category') and k=='category')]
        navigation=urlunsplit((parts.scheme,parts.netloc,parts.path,urlencode(query),''))
        driver.get(navigation)
        WebDriverWait(driver,30).until(lambda d:d.execute_script("return document.readyState==='interactive'||document.readyState==='complete'"))
        monitor=PublisherSettle()
        def settle():
            # Require a fresh quiet window after each action, even if its XHR
            # starts on the next browser event-loop tick.
            monitor.last_activity=monitor.clock()
            WebDriverWait(driver,30,poll_frequency=.1).until(lambda d:settled_view(d,monitor))
        settle()
        expanded=0;scroll_limit=False;expansion_limit=False
        tab=selected.get('stock_tab')
        if tab:
            WebDriverWait(driver,30).until(lambda d:any(tab in n.text for n in d.find_elements(By.CSS_SELECTOR,'.normal-tab.selected-tab')))
        category=selected.get('category')
        if category:
            button=WebDriverWait(driver,15).until(lambda d:next((n for n in d.find_elements(By.CSS_SELECTOR,'button.tab-btn') if n.text.strip()==category),None))
            driver.execute_script("arguments[0].scrollIntoView({block:'center',inline:'center',behavior:'instant'});",button)
            button.click();settle()
            WebDriverWait(driver,15).until(lambda d:any(n.text.strip()==category for n in d.find_elements(By.CSS_SELECTOR,'button.tab-btn.active')))
            expanded,expansion_limit=expand_groups(driver,By,settle)
        if selected.get('history_start'):
            label=next((n for n in driver.find_elements(By.TAG_NAME,'label') if n.text.strip()=='Start Date'),None)
            if label is None or not label.get_attribute('for'):raise ValueError('Observed history date control unavailable')
            control=driver.find_element(By.ID,label.get_attribute('for'))
            driver.execute_script("arguments[0].value=arguments[1];arguments[0].dispatchEvent(new Event('input',{bubbles:true}));arguments[0].dispatchEvent(new Event('change',{bubbles:true}));",control,selected['history_start'])
            control.send_keys(Keys.TAB);settle()
        if tab or selected.get('discovery'):
            for step in range(12):
                before=driver.execute_script("return [document.body.scrollHeight,document.querySelectorAll('tr').length,document.querySelectorAll('.file-content').length,document.querySelectorAll('a[href]').length]")
                driver.execute_script('window.scrollTo(0,document.body.scrollHeight)');settle()
                after=driver.execute_script("return [document.body.scrollHeight,document.querySelectorAll('tr').length,document.querySelectorAll('.file-content').length,document.querySelectorAll('a[href]').length]")
                if before==after:break
                if step==11:scroll_limit=True
        # Verify the selected financial category and mark whole-table visibility.
        # Horizontally clipped year columns remain in the DOM and are retained;
        # inactive category panels must not be relabelled as the selected one.
        if category:
            driver.execute_script("document.querySelectorAll('table').forEach(t=>t.setAttribute('data-continua-observed-visible',t.getClientRects().length?'true':'false'))")
        html=driver.page_source
        if len(html.encode())>8*1024*1024:raise ValueError('Rendered HTML limit')
        result={'html':html,'finalUrl':driver.current_url,'status':monitor.status}
        if tab:result['coverage']={'tab':tab,'category':category,'rows':len(driver.find_elements(By.TAG_NAME,'tr')),'expandedRows':expanded,'scrollLimitReached':scroll_limit,'networkAndDOMSettled':True,'categoryVerified':bool(category),'expansionLimitReached':expansion_limit}
        elif selected.get('discovery'):result['coverage']={'scrollLimitReached':scroll_limit,'networkAndDOMSettled':True}
        return result
    finally:
        driver.quit()

def main():
    try:
        if len(sys.argv)!=2 or len(sys.argv[1])>65536:raise ValueError('Invalid browser request')
        print(json.dumps(render(json.loads(sys.argv[1])),ensure_ascii=False))
    except Exception as error:
        # Stable error categories only: never forward URLs, page content,
        # Chrome diagnostics, anonymous session values or stack traces.
        code=4 if str(error)=='Publisher HTTP error' else ERROR_EXIT_CODES.get(type(error).__name__,1)
        print('Native publisher rendering failed',file=sys.stderr);sys.exit(code)

if __name__=='__main__':main()
