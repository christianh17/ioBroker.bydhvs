# Older changes
## 1.2.1 (2021-05-20)
* Power is now fixed with 2 number after the decimal point
* bug removed, cell voltage for cell 64 works now

## 1.2.0 (2021-05-15)
* preparation for being listed in official repository
* English part in readme.md
* removed State.ErrorNum totally in code, datapoint has to be deleted manually - I did not found a way to do it with JS
* hopefully works with HVM and HVS and possibly with HVL (only American market)
* redesign and more robust detection: number of cells for voltage and temperature
* New: inverter type
* New: type of battery 
* compatibility with new js-controller 3.3
* compatibility with nodejs 15
* compatibility with admin UI 5


## 1.1.0 (2021-04-22)
* HVS-Version with two banks and - hopefully - correct display
* states are now with units, the existing states are changed
* new states Power_Consumption and Power_Delivery for summarizing 
* Systems with 5 modules: Temp display should work now for all cells, voltage only for first 128
* moved state from State.ErrorNum to System.ErrorNum --> old states exists further on, I do not know how to delete it, adapter.deletestate does not work.
* deleted test-answers --> moved to my BYD-HVS-Simulator
* some minor bugs removed
* obviously the adapter works for hvm, too -> need more testers and an idea for a new name

## 1.0.0 (2021-04-05)
* Update all dependencies
* first public version
## 0.1.4-beta.0 (2021-04-02)
* 1st change with release-script
## 0.1.3
- Test Mode for getting hex data easily, removed check for 2 modules, moved "diagnosis-states" to extra folder, renaming CellStates
## 0.1.2
- Battery Voltage is unsigned, should now work with 4 modules
## 0.1.1
- start of documentation (German)
## 0.1.0
- (Christian) first testing release with (limited) public announcement
## 0.0.1
- (Christian) initial release



