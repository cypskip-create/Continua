"""Package-safe subprocess entrypoint.

Do not execute a file inside continua_scraper directly: its html.py would shadow
the standard-library html package used by Selenium and its dependencies.
"""
from continua_scraper.browser_worker import main
import sys

if __name__=='__main__':
    if sys.argv[1:]==['--check-dependencies']:
        import selenium.webdriver
        import html.parser
        print('native-browser-dependencies-ok')
    else:main()
