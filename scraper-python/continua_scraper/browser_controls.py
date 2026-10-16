"""Only observed, read-only publisher controls; never click arbitrary buttons."""

def expand_groups(driver, by, settle, limit=200):
    expanded=0
    while expanded<limit:
        # Re-query after each expansion: nested rows can create new controls.
        controls=driver.find_elements(by.CSS_SELECTOR,'table .expand-button:not(.expanded):not([aria-expanded="true"])')
        controls=[node for node in controls if node.is_displayed() and node.is_enabled()]
        if not controls:return expanded,False
        button=controls[0]
        driver.execute_script("arguments[0].scrollIntoView({block:'center',inline:'center',behavior:'instant'});",button)
        button.click();settle();expanded+=1
        # A changed selector must fail visibly rather than toggling a row shut.
        if button.is_displayed() and 'expanded' not in (button.get_attribute('class') or '').split() and button.get_attribute('aria-expanded')!='true':
            raise ValueError('Publisher expansion state not confirmed')
    return expanded,bool(driver.find_elements(by.CSS_SELECTOR,'table .expand-button:not(.expanded):not([aria-expanded="true"])'))
