"""Select only an observed publisher tab, then verify the resulting view."""
def select_stock_tab(driver,by,tab,wait,settle):
    def selected(d):
        return any(n.text.strip()==tab for n in d.find_elements(by.CSS_SELECTOR,'.normal-tab.selected-tab'))
    if selected(driver):return
    # Some hydrated publisher pages retain Summary despite a valid ?tab= URL.
    # Waiting longer cannot select it: use the actual visible tab control.
    button=wait.until(lambda d:next((n for n in d.find_elements(by.CSS_SELECTOR,'.normal-tab') if n.text.strip()==tab and n.is_displayed()),None))
    driver.execute_script("arguments[0].scrollIntoView({block:'center',inline:'center',behavior:'instant'});",button)
    button.click();settle();wait.until(selected)
